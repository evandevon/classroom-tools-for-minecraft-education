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
import { HelpService } from "../help/help.service.ts";
import { RolesScene } from "./roles.scene.ts";
import { TimerService } from "../timer/timer.service.ts";
import { formatTimeLeft } from "./timed-entries.ts";
import {
	PlayerSelectOptions,
	PlayerSelectScene,
} from "./player-select.scene.ts";

/**
 * Knows who the teacher is. There is exactly one: the first person to open
 * the world with this pack on. Teachers can assign more teachers, who have
 * full control, and helpers, who answer help flags. An operator can take over with
 * /scriptevent edu_tools:claim_teacher (for example on a copied world).
 */
export class StudentsService implements Module {
	static readonly id = "students";
	public readonly id = StudentsService.id;
	private static readonly TEACHER_KEY = "teacher_id";
	// Keeps the old key so anyone given full authority in v1.8 stays a teacher.
	private static readonly TEACHERS_KEY = "trusted_players";
	private static readonly HELPERS_KEY = "helpers";

	constructor(private readonly moduleManager: ModuleManager) {}

	initialize(): void {
		world.afterEvents.playerSpawn.subscribe((event) => {
			if (!this.getTeacherId()) this.setTeacher(event.player);
			// Someone removed while offline shouldn't keep a toolbox.
			system.runTimeout(() => {
				if (!this.canUseToolbox(event.player.id)) {
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
					this.removeTeacher(player.id);
					this.removeHelper(player.id);
					this.help()?.syncItems(player);
					this.items()?.giveEducatorTool(player);
					player.sendMessage("§aYou are now the teacher in this world.");
				}
			},
		);
		system.runInterval(() => this.updateScreens(), 20);
	}

	registerScenes(sceneManager: SceneManager): void {
		sceneManager.registerScene(
			RolesScene.id,
			(manager: SceneManager, context: SceneContext) => {
				new RolesScene(manager, context, this);
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
				"roles",
				{
					labelKey: "edu_tools.ui.main.buttons.roles",
					iconPath: "textures/edu_tools/ui/main/trusted_players",
					handler: (sceneManager: SceneManager, context: SceneContext) => {
						sceneManager.openSceneWithContext(context, RolesScene.id, true);
					},
					weight: 80,
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

	private readList(key: string): Record<string, string> {
		const raw = world.getDynamicProperty(key);
		if (typeof raw !== "string") return {};
		try {
			return JSON.parse(raw);
		} catch (e) {
			console.warn(`Could not read ${key}: ${e}`);
			return {};
		}
	}

	private saveList(key: string, list: Record<string, string>): void {
		world.setDynamicProperty(key, JSON.stringify(list));
	}

	/** Teachers other than the original one, by ID. */
	getAssignedTeachers(): Record<string, string> {
		return this.readList(StudentsService.TEACHERS_KEY);
	}

	getHelpers(): Record<string, string> {
		return this.readList(StudentsService.HELPERS_KEY);
	}

	isHelper(playerId: string): boolean {
		return playerId in this.getHelpers();
	}

	/** Same as isTeacher: kept for places that mean "not a student". */
	isStaff(playerId: string): boolean {
		return this.isTeacher(playerId);
	}

	/** Who may hold a toolbox. */
	canUseToolbox(playerId: string): boolean {
		return this.isTeacher(playerId);
	}

	addTeachers(players: { id: string; name: string }[]): void {
		const teachers = this.getAssignedTeachers();
		const helpers = this.getHelpers();
		for (const { id, name } of players) {
			if (this.getTeacherId() === id) continue;
			teachers[id] = name;
			delete helpers[id];
		}
		this.saveList(StudentsService.TEACHERS_KEY, teachers);
		this.saveList(StudentsService.HELPERS_KEY, helpers);
		for (const { id } of players) {
			const player = world.getEntity(id) as Player | undefined;
			if (player) {
				this.items()?.giveEducatorTool(player);
				this.help()?.syncItems(player);
				player.sendMessage("§aYou are now a teacher in this world.");
			}
		}
	}

	/** The original teacher isn't on this list, so can't be removed here. */
	removeTeacher(playerId: string): void {
		const teachers = this.getAssignedTeachers();
		if (!(playerId in teachers)) return;
		delete teachers[playerId];
		this.saveList(StudentsService.TEACHERS_KEY, teachers);
		this.afterRoleRemoved(playerId, "§eYou are no longer a teacher here.");
	}

	addHelpers(players: { id: string; name: string }[]): void {
		const helpers = this.getHelpers();
		for (const { id, name } of players) {
			if (!this.isTeacher(id)) helpers[id] = name;
		}
		this.saveList(StudentsService.HELPERS_KEY, helpers);
		for (const { id } of players) {
			const player = world.getEntity(id) as Player | undefined;
			if (player) {
				this.help()?.syncItems(player);
				player.sendMessage(
					"§aYou are now a helper. You'll hear a sound when someone needs help. Use your Helper Badge to go to them.",
				);
			}
		}
	}

	removeHelper(playerId: string): void {
		const helpers = this.getHelpers();
		if (!(playerId in helpers)) return;
		delete helpers[playerId];
		this.saveList(StudentsService.HELPERS_KEY, helpers);
		const player = world.getEntity(playerId) as Player | undefined;
		if (player) {
			this.help()?.syncItems(player);
			player.sendMessage("§eYou are no longer a helper.");
		}
	}

	private help(): HelpService | undefined {
		return this.moduleManager.getModule<HelpService>(HelpService.id);
	}

	private afterRoleRemoved(playerId: string, message: string): void {
		const player = world.getEntity(playerId) as Player | undefined;
		if (player && !this.canUseToolbox(playerId)) {
			this.items()?.removeEducatorTool(player);
			this.help()?.syncItems(player);
			player.sendMessage(message);
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
		return this.getTeacherId() === playerId ||
			playerId in this.getAssignedTeachers();
	}

	getTeacher(): Player | undefined {
		return world.getAllPlayers().find((p) => this.isTeacher(p.id));
	}

	/** Online players other than teachers, A to Z. */
	getOnlineStudents(): Player[] {
		return world.getAllPlayers()
			.filter((p) => !this.isStaff(p.id))
			.sort((a, b) => a.name.localeCompare(b.name));
	}

	/** Tells every teacher when something ends by itself. */
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
		const waiting = this.help()?.waitingCount() ?? 0;
		for (const player of world.getAllPlayers()) {
			const parts = timer ? [timer] : [];
			if (waiting && (this.isTeacher(player.id) || this.isHelper(player.id))) {
				parts.push(`Help needed: ${waiting}`);
			}
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
