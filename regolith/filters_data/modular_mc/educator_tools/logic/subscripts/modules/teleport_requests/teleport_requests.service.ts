import { Player, system, world } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { Module, ModuleManager } from "../../module-manager.ts";
import { BehaviourLogService } from "../behaviour_log/behaviour_log.service.ts";
import { BuildMarkerService } from "../build_marker/build_marker.service.ts";
import { FocusModeService } from "../focus_mode/focus_mode.service.ts";
import { LockPlayerService } from "../lock_player/lock_player.service.ts";
import { ButtonConfig } from "../main/main.service.ts";
import { SceneContext } from "../scene_manager/scene-context.ts";
import { SceneManager } from "../scene_manager/scene-manager.ts";
import { ActionUIScene } from "../scene_manager/ui-scene.ts";
import { StudentsService } from "../students/students.service.ts";

const ACTIVE_KEY = "teleport_requests_on";
const COOLDOWN_MS = 20000;
const BUSY_RETRIES = 5;
const BUSY_RETRY_TICKS = 40;

type VisitKind = "character" | "build";

/**
 * When a teacher allows it, students can ask to visit each other. Nothing
 * happens unless the person being visited says yes.
 */
export class TeleportRequestsService implements Module {
	static readonly id = "teleport_requests";
	public readonly id = TeleportRequestsService.id;
	private readonly lastRequest = new Map<string, number>();
	private readonly pendingFor = new Set<string>();

	constructor(private readonly moduleManager: ModuleManager) {}

	registerScenes(sceneManager: SceneManager): void {
		sceneManager.registerScene(
			VisitListScene.id,
			(manager: SceneManager, context: SceneContext) => {
				new VisitListScene(manager, context, this);
			},
		);
	}

	getExtraMainButtons(): [string, ButtonConfig][] {
		return [
			[
				"allow_requests",
				{
					labelKey: "edu_tools.ui.main.buttons.allow_requests",
					iconPath: "textures/edu_tools/ui/main/teleport",
					handler: (_: SceneManager, context: SceneContext) => {
						this.setActive(true);
						context.getSourcePlayer().sendMessage(
							"§aTeleport requests are on.",
						);
					},
					weight: 52,
					visible: () => !this.isActive(),
				},
			],
			[
				"stop_requests",
				{
					labelKey: "edu_tools.ui.main.buttons.stop_requests",
					iconPath: "textures/edu_tools/ui/main/teleport",
					handler: (_: SceneManager, context: SceneContext) => {
						this.setActive(false);
						context.getSourcePlayer().sendMessage(
							"§aTeleport requests are off.",
						);
					},
					weight: 52,
					visible: () => this.isActive(),
				},
			],
		];
	}

	isActive(): boolean {
		return world.getDynamicProperty(ACTIVE_KEY) === true;
	}

	setActive(active: boolean): void {
		world.setDynamicProperty(ACTIVE_KEY, active);
		for (const student of this.students().getOnlineStudents()) {
			student.sendMessage(
				active
					? "§aYou can now ask to visit others. Open Student Tools."
					: "§eTeleport requests have been turned off.",
			);
		}
	}

	students(): StudentsService {
		return this.moduleManager.getModule<StudentsService>(StudentsService.id)!;
	}

	markers(): BuildMarkerService {
		return this.moduleManager.getModule<BuildMarkerService>(
			BuildMarkerService.id,
		)!;
	}

	private unavailable(playerId: string): boolean {
		return !!this.moduleManager.getModule<FocusModeService>(FocusModeService.id)
			?.isFrozen(playerId);
	}

	private isLocked(playerId: string): boolean {
		return !!this.moduleManager.getModule<LockPlayerService>(
			LockPlayerService.id,
		)?.isLocked(playerId);
	}

	request(from: Player, toId: string, kind: VisitKind): void {
		const to = world.getEntity(toId) as Player | undefined;
		if (!this.isActive() || !to) {
			from.sendMessage("§eThat request isn't available now.");
			return;
		}
		if (this.isLocked(from.id)) {
			from.sendMessage("§eYou're locked to an area, so you can't visit others.");
			return;
		}
		const wait = (this.lastRequest.get(from.id) ?? 0) + COOLDOWN_MS - Date.now();
		if (wait > 0) {
			from.sendMessage(
				`§ePlease wait ${Math.ceil(wait / 1000)} seconds before asking again.`,
			);
			return;
		}
		if (this.unavailable(to.id) || this.pendingFor.has(to.id)) {
			from.sendMessage(`§e${to.name} can't answer right now. Try again soon.`);
			return;
		}
		this.lastRequest.set(from.id, Date.now());
		this.pendingFor.add(to.id);
		from.sendMessage(`§aAsked ${to.name}. Waiting for an answer.`);
		this.ask(from.id, from.name, to, kind, BUSY_RETRIES);
	}

	private ask(
		fromId: string,
		fromName: string,
		to: Player,
		kind: VisitKind,
		retries: number,
	): void {
		new ActionFormData()
			.title("edu_tools.ui.teleport_request.title")
			.body(
				kind === "build"
					? `${fromName} would like to visit your build.`
					: `${fromName} would like to teleport to you.`,
			)
			.button("edu_tools.ui.teleport_request.allow")
			.button("edu_tools.ui.teleport_request.deny")
			.show(to)
			.then((r) => {
				if (r.canceled && String(r.cancelationReason) === "UserBusy") {
					if (retries > 0) {
						system.runTimeout(
							() => this.ask(fromId, fromName, to, kind, retries - 1),
							BUSY_RETRY_TICKS,
						);
						return;
					}
					this.pendingFor.delete(to.id);
					this.answer(fromId, `§e${to.name} is busy. Try again soon.`);
					return;
				}
				this.pendingFor.delete(to.id);
				if (r.canceled || r.selection !== 0) {
					this.answer(fromId, `§e${to.name} can't have visitors right now.`);
					return;
				}
				this.approve(fromId, to, kind);
			})
			.catch((e) => {
				this.pendingFor.delete(to.id);
				console.warn(`Teleport request failed: ${e}`);
			});
	}

	private answer(fromId: string, message: string): void {
		(world.getEntity(fromId) as Player | undefined)?.sendMessage(message);
	}

	private approve(fromId: string, to: Player, kind: VisitKind): void {
		const from = world.getEntity(fromId) as Player | undefined;
		// Things may have changed while the question was on screen.
		if (
			!from || !this.isActive() || this.unavailable(from.id) ||
			this.isLocked(from.id)
		) {
			to.sendMessage("§eThat visit can't go ahead now.");
			return;
		}
		const marker = this.markers().getMarker(to.id);
		if (kind === "build" && !marker) {
			from.sendMessage(`§e${to.name} doesn't have a marker now.`);
			return;
		}
		if (kind === "build") {
			this.markers().teleportSelection(
				{ everybody: false, players: [{ id: from.id, name: from.name }] },
				marker!,
			);
		} else {
			from.teleport(to.location, { dimension: to.dimension });
		}
		from.sendMessage(`§a${to.name} said yes.`);
		to.sendMessage(`§a${from.name} is visiting you.`);
		this.moduleManager.getModule<BehaviourLogService>(BehaviourLogService.id)
			?.add(from.name, `Visited ${to.name}`, kind === "build" ? "build" : "");
	}
}

class VisitListScene extends ActionUIScene {
	static readonly id = "visit_list";

	constructor(
		sceneManager: SceneManager,
		context: SceneContext,
		service: TeleportRequestsService,
	) {
		super(VisitListScene.id, context.getSourcePlayer());
		this.setContext(context);
		this.setSimpleBody("edu_tools.ui.visit_list.body");
		// Students only, and only ones online who can answer.
		for (const student of service.students().getOnlineStudents()) {
			if (student.id === this.player.id) continue;
			this.addButton(`${student.name} (character)`, () => {
				service.request(this.player, student.id, "character");
			});
			if (service.markers().getMarker(student.id)) {
				this.addButton(`${student.name}'s build`, () => {
					service.request(this.player, student.id, "build");
				});
			}
		}
		this.addButton(
			"edu_tools.ui.buttons.back",
			() => {
				sceneManager.goBackToScene(context, "student_menu");
			},
			"textures/edu_tools/ui/_general/back",
		);
		this.show(context.getSourcePlayer(), sceneManager);
	}
}
