import { GameMode, Player, world } from "@minecraft/server";
import { Module, ModuleManager } from "../../module-manager.ts";
import { ButtonConfig } from "../main/main.service.ts";
import { PlayerStatusService } from "../player_status/player_status.service.ts";
import { SceneContext } from "../scene_manager/scene-context.ts";
import { SceneManager } from "../scene_manager/scene-manager.ts";
import { StudentsService } from "../students/students.service.ts";
import {
	formatTimeLeft,
	Selection,
	TimedEntries,
	TimedEntry,
} from "../students/timed-entries.ts";
import { FocusModeMechanic } from "./focus_mode.mechanic.ts";
import { FocusModeScene, FocusModeSettingsScene } from "./focus_mode.scene.ts";

export interface FocusData {
	message?: string;
}

/** Freezes individual students, or everybody, for a chosen time. */
export class FocusModeService implements Module {
	static readonly id = "focus_mode";
	public readonly id = FocusModeService.id;
	private readonly entries = new TimedEntries<FocusData>(world, "focus_state");
	private readonly mechanic = new FocusModeMechanic(this);
	students!: StudentsService;
	private playerStatus!: PlayerStatusService;

	constructor(private readonly moduleManager: ModuleManager) {}

	initialize(): void {
		this.students = this.moduleManager.getModule<StudentsService>(
			StudentsService.id,
		)!;
		this.playerStatus = this.moduleManager.getModule<PlayerStatusService>(
			PlayerStatusService.id,
		)!;
		this.mechanic.initialize();
	}

	registerScenes(sceneManager: SceneManager): void {
		sceneManager.registerScene(
			FocusModeScene.id,
			(manager: SceneManager, context: SceneContext) => {
				new FocusModeScene(manager, context, this);
			},
		);
		sceneManager.registerScene(
			FocusModeSettingsScene.id,
			(
				manager: SceneManager,
				context: SceneContext,
				selection: Selection,
			) => {
				new FocusModeSettingsScene(manager, context, this, selection);
			},
		);
	}

	getMainButton(): ButtonConfig {
		return {
			labelKey: "edu_tools.ui.main.buttons.focus_mode",
			iconPath: "textures/edu_tools/ui/main/focus_mode",
			handler: (sceneManager: SceneManager, context: SceneContext) => {
				sceneManager.openSceneWithContext(context, FocusModeScene.id, true);
			},
			weight: 10,
		};
	}

	getEntries(): TimedEntries<FocusData> {
		return this.entries;
	}

	freeze(selection: Selection, minutes: number | null, data: FocusData): void {
		this.entries.apply(selection, minutes, data);
	}

	release(ids: string[]): void {
		this.entries.release(ids);
	}

	releaseAll(): void {
		this.entries.releaseAll();
	}

	isFrozen(playerId: string): boolean {
		return !this.students.isTeacher(playerId) &&
			!!this.entries.effective(playerId);
	}

	/** Whether this player's freeze has been applied in the game yet. */
	wasFrozen(player: Player): boolean {
		return player.getDynamicProperty("focus_mode") === true;
	}

	applyFreeze(player: Player, entry: TimedEntry<FocusData>): void {
		player.setDynamicProperty("focus_mode", true);
		this.playerStatus.registerHolder(player, this.id);
		if (!this.playerStatus.hasGameModeSaved(player)) {
			this.playerStatus.savePlayerGameMode(player);
		}
		player.setGameMode(GameMode.Spectator);
		this.playerStatus.setAllInputPermissions(player, false);
		player.onScreenDisplay.hideAllExcept();
		player.camera.fade({
			fadeTime: { holdTime: 3, fadeInTime: 0.5, fadeOutTime: 0.5 },
		});
		const parts: string[] = [];
		if (entry.data.message) parts.push(entry.data.message);
		if (entry.until !== null) parts.push(`${formatTimeLeft(entry.until)} left`);
		player.onScreenDisplay.setTitle(
			{ translate: "edu_tools.ui.focus_mode.screen_title" },
			{
				stayDuration: 60,
				fadeInDuration: 0,
				fadeOutDuration: 10,
				subtitle: parts.join("\n"),
			},
		);
	}

	removeFreeze(player: Player): void {
		this.playerStatus.deleteHolder(player, this.id);
		if (this.playerStatus.getHolders(player).length === 0) {
			this.playerStatus.restoreAllPlayerState(player);
		}
		player.setDynamicProperty("focus_mode", false);
		player.onScreenDisplay.setTitle("", {
			stayDuration: 0,
			fadeInDuration: 0,
			fadeOutDuration: 0,
		});
		player.sendMessage("§aYou can move again.");
	}
}
