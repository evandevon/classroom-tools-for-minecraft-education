import { Player, system, Vector3, world } from "@minecraft/server";
import { Module, ModuleManager } from "../../module-manager.ts";
import { BehaviourLogService } from "../behaviour_log/behaviour_log.service.ts";
import { BuildMarkerService } from "../build_marker/build_marker.service.ts";
import { FocusModeService } from "../focus_mode/focus_mode.service.ts";
import { ItemService } from "../item/item.service.ts";
import { LockPlayerService } from "../lock_player/lock_player.service.ts";
import { ButtonConfig } from "../main/main.service.ts";
import { SceneContext } from "../scene_manager/scene-context.ts";
import { SceneManager } from "../scene_manager/scene-manager.ts";
import { ActionUIScene } from "../scene_manager/ui-scene.ts";
import { StudentsService } from "../students/students.service.ts";
import { formatTimeLeft } from "../students/timed-entries.ts";

export const HELP_FLAG_ITEM = "edu_tools:help_flag";
export const HELPER_ITEM = "edu_tools:helper_badge";
const FLAG_ENTITY = "edu_tools:help_flag";
const STAMP_PROPERTY = "help_stamp";
const KEY = "help_requests";
const DIMENSIONS = ["overworld", "nether", "the_end"];
const PLANT_COOLDOWN_MS = 20000;
const PING_EVERY_MS = 60000;
const CLAIM_LIMIT_MS = 5 * 60000;

export interface HelpRequest {
	id: string; // The student asking
	name: string;
	location: Vector3;
	dimensionId: string;
	since: number;
	stamp: string;
	lastPing: number;
	helperId?: string;
	helperName?: string;
	claimedAt?: number;
}

/**
 * Students plant a Help Flag. Helpers and teachers are pinged, and can
 * teleport to the student. Each request has one helper at a time.
 */
export class HelpService implements Module {
	static readonly id = "help";
	public readonly id = HelpService.id;
	private requests: HelpRequest[] = [];
	private readonly lastPlanted = new Map<string, number>();

	constructor(private readonly moduleManager: ModuleManager) {}

	initialize(): void {
		const raw = world.getDynamicProperty(KEY);
		if (typeof raw === "string") {
			try {
				this.requests = JSON.parse(raw);
			} catch (e) {
				console.warn(`Could not read help requests: ${e}`);
			}
		}
		world.afterEvents.playerSpawn.subscribe((event) => {
			system.runTimeout(() => this.syncItems(event.player), 2);
		});
		world.afterEvents.itemUse.subscribe((event) => {
			if (event.itemStack.typeId === HELP_FLAG_ITEM) {
				this.onFlagUsed(event.source);
			} else if (event.itemStack.typeId === HELPER_ITEM) {
				this.onBadgeUsed(event.source);
			}
		});
		system.runInterval(() => this.tick(), 20);
	}

	registerScenes(sceneManager: SceneManager): void {
		sceneManager.registerScene(
			HelpRequestsScene.id,
			(manager: SceneManager, context: SceneContext) => {
				new HelpRequestsScene(manager, context, this);
			},
		);
	}

	getExtraMainButtons(): [string, ButtonConfig][] {
		return [[
			"help_requests",
			{
				labelKey: "edu_tools.ui.main.buttons.help_requests",
				iconPath: "textures/edu_tools/ui/main/help_flag",
				handler: (sceneManager: SceneManager, context: SceneContext) => {
					sceneManager.openSceneWithContext(
						context,
						HelpRequestsScene.id,
						true,
					);
				},
				weight: 0,
				visible: () => this.requests.length > 0,
			},
		]];
	}

	students(): StudentsService {
		return this.moduleManager.getModule<StudentsService>(StudentsService.id)!;
	}

	private isFrozen(playerId: string): boolean {
		return !!this.moduleManager.getModule<FocusModeService>(FocusModeService.id)
			?.isFrozen(playerId);
	}

	getRequests(): HelpRequest[] {
		return this.requests;
	}

	waitingCount(): number {
		return this.requests.filter((r) => !r.helperId).length;
	}

	getRequestBeingHelpedBy(playerId: string): HelpRequest | undefined {
		return this.requests.find((r) => r.helperId === playerId);
	}

	/** Gives or takes the Help Flag and Helper Badge to match someone's role. */
	syncItems(player: Player): void {
		const items = this.moduleManager.getModule<ItemService>(ItemService.id);
		if (!items) return;
		try {
			if (this.students().isTeacher(player.id)) {
				// The main teacher keeps a flag for demonstrating to the class.
				if (this.students().getTeacherId() === player.id) {
					items.giveItem(player, HELP_FLAG_ITEM);
				} else {
					items.removeItem(player, HELP_FLAG_ITEM);
				}
				items.removeItem(player, HELPER_ITEM);
				return;
			}
			items.giveItem(player, HELP_FLAG_ITEM);
			if (this.students().isHelper(player.id)) {
				items.giveItem(player, HELPER_ITEM);
			} else {
				items.removeItem(player, HELPER_ITEM);
			}
		} catch (e) {
			console.warn(`Could not update items for ${player.name}: ${e}`);
		}
	}

	private onFlagUsed(player: Player): void {
		const isOtherTeacher = this.students().isTeacher(player.id) &&
			this.students().getTeacherId() !== player.id;
		if (isOtherTeacher || this.isFrozen(player.id)) return;
		const existing = this.requests.find((r) => r.id === player.id);
		if (existing) {
			this.cancel(existing);
			player.sendMessage("§aYour help flag has been removed.");
			return;
		}
		const wait = (this.lastPlanted.get(player.id) ?? 0) + PLANT_COOLDOWN_MS -
			Date.now();
		if (wait > 0) {
			player.sendMessage(
				`§ePlease wait ${Math.ceil(wait / 1000)} seconds before asking again.`,
			);
			return;
		}
		this.lastPlanted.set(player.id, Date.now());
		const location = { ...player.location };
		const stamp = `${player.id}:${Date.now()}`;
		const request: HelpRequest = {
			id: player.id,
			name: player.name,
			location,
			dimensionId: player.dimension.id,
			since: Date.now(),
			stamp,
			lastPing: Date.now(),
		};
		this.requests.push(request);
		this.save();
		try {
			const entity = player.dimension.spawnEntity(FLAG_ENTITY, location);
			entity.setDynamicProperty(STAMP_PROPERTY, stamp);
			entity.nameTag = `${player.name} needs help`;
		} catch (e) {
			console.warn(`Could not show help flag: ${e}`);
		}
		const told = this.ping(`§e${player.name} needs help.`, player.id);
		player.sendMessage(
			told
				? "§aYour help flag is up. Use it again to take it down."
				: "§eYour flag is up, but no helpers or teachers are online.",
		);
		player.playSound("random.orb");
	}

	/** Returns how many people were told. */
	private ping(message: string, exceptId?: string): number {
		let told = 0;
		for (const player of world.getAllPlayers()) {
			if (player.id === exceptId || this.isFrozen(player.id)) continue;
			const isHelper = this.students().isHelper(player.id);
			if (!isHelper && !this.students().isTeacher(player.id)) continue;
			player.sendMessage(
				isHelper ? `${message} Use your Helper Badge.` : message,
			);
			player.playSound("note.pling");
			told++;
		}
		return told;
	}

	private onBadgeUsed(player: Player): void {
		if (!this.students().isHelper(player.id) || this.isFrozen(player.id)) return;
		SceneManager.getInstance().createContextAndOpenScene(
			player,
			HelpRequestsScene.id,
		);
	}

	/** Teleports a helper or teacher to the student who asked. */
	claim(player: Player, requestId: string): void {
		const request = this.requests.find((r) => r.id === requestId);
		if (!request) {
			player.sendMessage("§eThat help flag has gone.");
			return;
		}
		if (request.helperId && request.helperId !== player.id) {
			player.sendMessage(`§e${request.helperName} is already helping.`);
			return;
		}
		if (this.getRequestBeingHelpedBy(player.id)) {
			player.sendMessage("§eFinish helping your current student first.");
			return;
		}
		if (
			this.moduleManager.getModule<LockPlayerService>(LockPlayerService.id)
				?.isLocked(player.id)
		) {
			player.sendMessage("§eYou're locked to an area, so you can't go there.");
			return;
		}
		request.helperId = player.id;
		request.helperName = player.name;
		request.claimedAt = Date.now();
		this.save();
		player.teleport(request.location, {
			dimension: world.getDimension(request.dimensionId),
		});
		(world.getEntity(request.id) as Player | undefined)?.sendMessage(
			`§a${player.name} is coming to help.`,
		);
		this.moduleManager.getModule<BehaviourLogService>(BehaviourLogService.id)
			?.add(player.name, `Helped ${request.name}`);
	}

	/** Ends the request. Optionally sends the helper back to their build. */
	finish(player: Player, returnToBuild: boolean): void {
		const request = this.getRequestBeingHelpedBy(player.id);
		if (request) this.cancel(request, false);
		if (!returnToBuild) return;
		const markers = this.moduleManager.getModule<BuildMarkerService>(
			BuildMarkerService.id,
		);
		const marker = markers?.getMarker(player.id);
		if (!marker) {
			player.sendMessage("§eYou don't have a marker to return to.");
			return;
		}
		player.teleport(marker.location, {
			dimension: world.getDimension(marker.dimensionId),
		});
	}

	private cancel(request: HelpRequest, tellHelper = true): void {
		this.requests = this.requests.filter((r) => r !== request);
		this.save();
		if (tellHelper && request.helperId) {
			(world.getEntity(request.helperId) as Player | undefined)?.sendMessage(
				`§e${request.name} took their help flag down.`,
			);
		}
		this.removeOldFlags();
	}

	removeAll(): void {
		this.requests = [];
		this.save();
		this.removeOldFlags();
	}

	private tick(): void {
		const now = Date.now();
		let changed = false;
		for (const request of [...this.requests]) {
			if (!world.getEntity(request.id)) {
				this.requests = this.requests.filter((r) => r !== request);
				changed = true;
				continue;
			}
			if (request.helperId) {
				// Back in the queue if the helper left, lost the role or ran out of time.
				const stillValid = !!world.getEntity(request.helperId) &&
					(this.students().isHelper(request.helperId) ||
						this.students().isTeacher(request.helperId));
				if (
					stillValid && now - (request.claimedAt ?? now) < CLAIM_LIMIT_MS
				) continue;
				if (stillValid) {
					(world.getEntity(request.helperId) as Player).sendMessage(
						`§e${request.name}'s help flag has gone back in the list.`,
					);
				}
				request.helperId = undefined;
				request.helperName = undefined;
				request.claimedAt = undefined;
				request.lastPing = now;
				changed = true;
				this.ping(`§e${request.name} still needs help.`, request.id);
			} else if (now - request.lastPing >= PING_EVERY_MS) {
				request.lastPing = now;
				changed = true;
				this.ping(`§e${request.name} is still waiting for help.`, request.id);
			}
		}
		if (changed) this.save();
		if (system.currentTick % 100 === 0) this.removeOldFlags();
	}

	private removeOldFlags(): void {
		const current = new Set(this.requests.map((r) => r.stamp));
		for (const id of DIMENSIONS) {
			try {
				for (const entity of world.getDimension(id).getEntities({
					type: FLAG_ENTITY,
				})) {
					if (!current.has(String(entity.getDynamicProperty(STAMP_PROPERTY)))) {
						entity.remove();
					}
				}
			} catch (e) {
				console.warn(`Could not tidy help flags in ${id}: ${e}`);
			}
		}
	}

	private save(): void {
		world.setDynamicProperty(KEY, JSON.stringify(this.requests));
	}
}

class HelpRequestsScene extends ActionUIScene {
	static readonly id = "help_requests";

	constructor(
		sceneManager: SceneManager,
		context: SceneContext,
		service: HelpService,
	) {
		super(HelpRequestsScene.id, context.getSourcePlayer());
		this.setContext(context);
		const current = service.getRequestBeingHelpedBy(this.player.id);
		const isTeacher = service.students().isTeacher(this.player.id);

		if (current) {
			this.setRawBody([{ text: `You're helping ${current.name}.` }]);
			this.addButton("edu_tools.ui.help_requests.finish_return", () => {
				service.finish(this.player, true);
			});
			this.addButton("edu_tools.ui.help_requests.finish_stay", () => {
				service.finish(this.player, false);
			});
			this.show(this.player, sceneManager);
			return;
		}

		// Oldest first, so nobody gets skipped.
		const waiting = service.getRequests()
			.filter((r) => r.id !== this.player.id)
			.sort((a, b) => a.since - b.since);
		this.setSimpleBody(
			waiting.length
				? "edu_tools.ui.help_requests.body"
				: "edu_tools.ui.help_requests.empty",
		);
		for (const request of waiting) {
			// Time waiting uses the same m:ss format, counted up from the flag.
			const waited = formatTimeLeft(Date.now(), request.since);
			this.addButton(
				request.helperId
					? `${request.name} (${request.helperName} is helping)`
					: `${request.name} (waiting ${waited})`,
				() => service.claim(this.player, request.id),
				"textures/edu_tools/ui/main/help_flag",
			);
		}
		if (isTeacher && waiting.length) {
			this.addButton(
				"edu_tools.ui.help_requests.clear",
				() => {
					service.removeAll();
					this.player.sendMessage("§aAll help flags have been removed.");
				},
				"textures/edu_tools/ui/lock_player/delete_lock",
			);
		}
		this.show(this.player, sceneManager);
	}
}
