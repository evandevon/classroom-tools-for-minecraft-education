import {
	Player,
	ScriptEventCommandMessageAfterEvent,
	system,
	world,
} from "@minecraft/server";
import { Module, ModuleManager } from "../../module-manager.ts";
import { ButtonConfig } from "../main/main.service.ts";
import { ItemService } from "../item/item.service.ts";
import { SceneContext } from "../scene_manager/scene-context.ts";
import { SceneManager } from "../scene_manager/scene-manager.ts";
import { FocusModeService } from "../focus_mode/focus_mode.service.ts";
import { LockPlayerService } from "../lock_player/lock_player.service.ts";
import { TrustedPlayersScene } from "./trusted-players.scene.ts";
import { TimerService } from "../timer/timer.service.ts";
import { formatTimeLeft } from "./timed-entries.ts";
import {
	PlayerSelectOptions,
	PlayerSelectScene,
} from "./player-select.scene.ts";

/**
 * Knows who the teacher is. There is exactly one: the first person to open
 * the world with this pack on. The teacher can also trust other players, who
 * get every tool except managing the trusted list. An operator can take over with
 * /scriptevent edu_tools:claim_teacher (for example on a copied world).
 */
export class StudentsService implements Module {
	static readonly id = "students";
	public readonly id = StudentsService.id;
	private static readonly TEACHER_KEY = "teacher_id";
	private static readonly TRUSTED_KEY = "trusted_players";

	constructor(private readonly moduleManager: ModuleManager) {}

	initialize(): void {
		world.afterEvents.playerSpawn.subscribe((event) => {
			if (!this.getTeacherId()) this.setTeacher(event.player);
			// Someone removed while offline shouldn't keep a toolbox.
			system.runTimeout(() => {
				if (!this.isStaff(event.player.id)) {
					this.items()?.removeEducatorTool(event.player);
				}
			}, 2);
		});
		system.afterEvents.scriptEventReceive.subscribe(
			(event: ScriptEventCommandMessageAfterEvent) => {
				if (
					event.id === "edu_tools:claim_teacher" &&
					event.sourceEntity?.typeId === "minecraft:player"
				) {
					const player = event.sourceEntity as Player;
					this.setTeacher(player);
					this.removeTrusted(player.id);
					this.items()?.giveEducatorTool(player);
					player.sendMessage("§aYou are now the teacher in this world.");
				}
			},
		);
		system.runInterval(() => this.updateScreens(), 20);
	}

	registerScenes(sceneManager: SceneManager): void {
		sceneManager.registerScene(
			TrustedPlayersScene.id,
			(manager: SceneManager, context: SceneContext) => {
				new TrustedPlayersScene(manager, context, this);
			},
		);
		sceneManager.registerScene(
			PlayerSelectScene.id,
			(
				manager: SceneManager,
				context: SceneContext,
				options: PlayerSelectOptions,
			) => {
				new PlayerSelectScene(manager, context, options);
			},
		);
	}

	getExtraMainButtons(): [string, ButtonConfig][] {
		return [
			[
				"trusted_players",
				{
					labelKey: "edu_tools.ui.main.buttons.trusted_players",
					iconPath: "textures/edu_tools/ui/main/trusted_players",
					handler: (sceneManager: SceneManager, context: SceneContext) => {
						sceneManager.openSceneWithContext(
							context,
							TrustedPlayersScene.id,
							true,
						);
					},
					weight: 80,
					visible: (player) => this.isTeacher(player.id),
				},
			],
			[
				"end_focus",
				{
					labelKey: "edu_tools.ui.main.buttons.end_focus",
					iconPath: "textures/edu_tools/ui/focus_mode/global_disable",
					handler: (_: SceneManager, context: SceneContext) => {
						this.focus()?.releaseAll();
						context.getSourcePlayer().sendMessage(
							"§aFocus Mode has ended for everybody.",
						);
					},
					weight: 1,
					visible: () => !this.focus()?.getEntries().isEmpty(),
				},
			],
			[
				"unlock_everybody",
				{
					labelKey: "edu_tools.ui.main.buttons.unlock_everybody",
					iconPath: "textures/edu_tools/ui/lock_player/delete_lock",
					handler: (_: SceneManager, context: SceneContext) => {
						this.lock()?.releaseAll();
						context.getSourcePlayer().sendMessage(
							"§aEverybody has been unlocked.",
						);
					},
					weight: 2,
					visible: () => !this.lock()?.getEntries().isEmpty(),
				},
			],
		];
	}

	private items(): ItemService | undefined {
		return this.moduleManager.getModule<ItemService>(ItemService.id);
	}

	/** Trusted players, by ID. Names are kept so offline players can be listed. */
	getTrusted(): Record<string, string> {
		const raw = world.getDynamicProperty(StudentsService.TRUSTED_KEY);
		if (typeof raw !== "string") return {};
		try {
			return JSON.parse(raw);
		} catch (e) {
			console.warn(`Could not read trusted players: ${e}`);
			return {};
		}
	}

	private saveTrusted(trusted: Record<string, string>): void {
		world.setDynamicProperty(
			StudentsService.TRUSTED_KEY,
			JSON.stringify(trusted),
		);
	}

	isTrusted(playerId: string): boolean {
		return playerId in this.getTrusted();
	}

	/** The teacher or a trusted player. */
	isStaff(playerId: string): boolean {
		return this.isTeacher(playerId) || this.isTrusted(playerId);
	}

	addTrusted(players: { id: string; name: string }[]): void {
		const trusted = this.getTrusted();
		for (const { id, name } of players) {
			if (this.isTeacher(id)) continue;
			trusted[id] = name;
			const player = world.getEntity(id) as Player | undefined;
			if (player) {
				this.items()?.giveEducatorTool(player);
				player.sendMessage("§aYou are now a trusted player. Use the Classroom Toolbox.");
			}
		}
		this.saveTrusted(trusted);
	}

	removeTrusted(playerId: string): void {
		const trusted = this.getTrusted();
		if (!(playerId in trusted)) return;
		delete trusted[playerId];
		this.saveTrusted(trusted);
		const player = world.getEntity(playerId) as Player | undefined;
		if (player && !this.isTeacher(playerId)) {
			this.items()?.removeEducatorTool(player);
			player.sendMessage("§eYou are no longer a trusted player.");
		}
	}

	/** Everyone online except this player, including staff. */
	getOtherPlayers(playerId: string): Player[] {
		return world.getAllPlayers()
			.filter((p) => p.id !== playerId)
			.sort((a, b) => a.name.localeCompare(b.name));
	}

	getTeacherId(): string | undefined {
		const id = world.getDynamicProperty(StudentsService.TEACHER_KEY);
		return typeof id === "string" ? id : undefined;
	}

	private setTeacher(player: Player): void {
		world.setDynamicProperty(StudentsService.TEACHER_KEY, player.id);
	}

	isTeacher(playerId: string): boolean {
		return this.getTeacherId() === playerId;
	}

	getTeacher(): Player | undefined {
		return world.getAllPlayers().find((p) => this.isTeacher(p.id));
	}

	/** Online players other than the teacher and trusted players, A to Z. */
	getOnlineStudents(): Player[] {
		return world.getAllPlayers()
			.filter((p) => !this.isStaff(p.id))
			.sort((a, b) => a.name.localeCompare(b.name));
	}

	/** Tells the teacher and trusted players when something ends by itself. */
	notifyTeacher(message: string): void {
		for (const player of world.getAllPlayers()) {
			if (!this.isStaff(player.id)) continue;
			player.sendMessage(message);
			player.playSound("random.orb");
		}
	}

	private focus(): FocusModeService | undefined {
		return this.moduleManager.getModule<FocusModeService>(FocusModeService.id);
	}

	private lock(): LockPlayerService | undefined {
		return this.moduleManager.getModule<LockPlayerService>(
			LockPlayerService.id,
		);
	}

	/** Shows the timer to everybody, plus each person's own lock or reminder. */
	private updateScreens(): void {
		const timer = this.moduleManager.getModule<TimerService>(TimerService.id)
			?.getHudText();
		const students = this.getOnlineStudents();
		for (const player of world.getAllPlayers()) {
			const parts = timer ? [timer] : [];
			if (this.isStaff(player.id)) {
				const frozen =
					students.filter((s) => this.focus()?.isFrozen(s.id)).length;
				const locked =
					students.filter((s) => this.lock()?.isLocked(s.id)).length;
				if (frozen + locked > 0) {
					parts.push(`In Focus: ${frozen}`, `Locked: ${locked}`);
				}
			} else {
				const entry = this.lock()?.getEntries().effective(player.id);
				if (entry) {
					parts.push(
						entry.until === null
							? "Locked to this area"
							: `Locked: ${formatTimeLeft(entry.until)} left`,
					);
				}
			}
			if (parts.length) {
				player.onScreenDisplay.setActionBar(`§e${parts.join("  |  ")}`);
			}
		}
	}
}
