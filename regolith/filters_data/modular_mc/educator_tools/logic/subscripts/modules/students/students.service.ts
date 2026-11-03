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
import { TimerService } from "../timer/timer.service.ts";
import { formatTimeLeft } from "./timed-entries.ts";
import {
	PlayerSelectOptions,
	PlayerSelectScene,
} from "./player-select.scene.ts";

/**
 * Knows who the teacher is. There is exactly one: the first person to open
 * the world with this pack on. An operator can take over with
 * /scriptevent edu_tools:claim_teacher (for example on a copied world).
 */
export class StudentsService implements Module {
	static readonly id = "students";
	public readonly id = StudentsService.id;
	private static readonly TEACHER_KEY = "teacher_id";

	constructor(private readonly moduleManager: ModuleManager) {}

	initialize(): void {
		world.afterEvents.playerSpawn.subscribe((event) => {
			if (!this.getTeacherId()) this.setTeacher(event.player);
		});
		system.afterEvents.scriptEventReceive.subscribe(
			(event: ScriptEventCommandMessageAfterEvent) => {
				if (
					event.id === "edu_tools:claim_teacher" &&
					event.sourceEntity?.typeId === "minecraft:player"
				) {
					const player = event.sourceEntity as Player;
					this.setTeacher(player);
					this.moduleManager.getModule<ItemService>(ItemService.id)
						?.giveEducatorTool(player);
					player.sendMessage("§aYou are now the teacher in this world.");
				}
			},
		);
		system.runInterval(() => this.updateScreens(), 20);
	}

	registerScenes(sceneManager: SceneManager): void {
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

	getMainButton(): ButtonConfig {
		return {
			labelKey: "edu_tools.ui.main.buttons.release_everybody",
			iconPath: "textures/edu_tools/ui/lock_player/delete_lock",
			handler: (_: SceneManager, context: SceneContext) => {
				this.focus()?.releaseAll();
				this.lock()?.releaseAll();
				context.getSourcePlayer().sendMessage(
					"§aEverybody has been released from Focus Mode and locks.",
				);
			},
			weight: 5,
			visible: () =>
				!this.focus()?.getEntries().isEmpty() ||
				!this.lock()?.getEntries().isEmpty(),
		};
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

	/** Online players other than the teacher, A to Z. */
	getOnlineStudents(): Player[] {
		return world.getAllPlayers()
			.filter((p) => !this.isTeacher(p.id))
			.sort((a, b) => a.name.localeCompare(b.name));
	}

	/** Tells the teacher when something ends by itself. */
	notifyTeacher(message: string): void {
		const teacher = this.getTeacher();
		if (!teacher) return;
		teacher.sendMessage(message);
		teacher.playSound("random.orb");
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
			if (this.isTeacher(player.id)) {
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
