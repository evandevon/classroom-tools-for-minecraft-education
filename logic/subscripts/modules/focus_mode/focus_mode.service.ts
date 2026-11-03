import { BehaviourLogService } from "../behaviour_log/behaviour_log.service.ts";
import { GameMode, Player, world } from "@minecraft/server";
import { Module, ModuleManager } from "../../module-manager.ts";
import { ButtonConfig } from "../main/main.service.ts";
import { PlayerStatusService } from "../player_status/player_status.service.ts";
import { SceneContext } from "../scene_manager/scene-context.ts";
import { SceneManager } from "../scene_manager/scene-manager.ts";
import { StudentsService } from "../students/students.service.ts";
import {
	describeMinutes,
	formatTimeLeft,
	Selection,
	TimedEntries,
	TimedEntry,
} from "../students/timed-entries.ts";
import { FocusModeMechanic } from "./focus_mode.mechanic.ts";
import {
	FocusModeScene,
	FocusModeSettingsScene,
	openFreezePicker,
} from "./focus_mode.scene.ts";

export interface FocusData {
	message?: string;
	mute?: boolean;
}

/** Freezes individual students, or everybody, for a chosen time. */
export class FocusModeService implements Module {
	static readonly id = "focus_mode";
	public readonly id = FocusModeService.id;
	private readonly entries = new TimedEntries<FocusData>(world, "focus_state");
	private readonly mechanic = new FocusModeMechanic(this);
	private readonly mutedThisSession = new Set<string>();
	private muteFailureReported = false;
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
				if (this.entries.isEmpty()) {
					openFreezePicker(sceneManager, context, this);
				} else {
					sceneManager.openSceneWithContext(context, FocusModeScene.id, true);
				}
			},
			weight: 10,
		};
	}

	/** Everybody, including students who join later. */
	classSelection(): Selection {
		return {
			everybody: true,
			players: this.students.getOnlineStudents().map((s) => ({
				id: s.id,
				name: s.name,
			})),
		};
	}

	getEntries(): TimedEntries<FocusData> {
		return this.entries;
	}

	freeze(selection: Selection, minutes: number | null, data: FocusData): void {
		this.entries.apply(selection, minutes, data);
		const length = describeMinutes(minutes);
		const note = [length, data.mute ? "chat off" : "", data.message ?? ""]
			.filter(Boolean).join(", ");
		if (selection.everybody) this.log("Everybody", "Focus Mode", note);
		else for (const p of selection.players) this.log(p.name, "Focus Mode", note);
	}

	private log(who: string, what: string, note?: string): void {
		this.moduleManager.getModule<BehaviourLogService>(BehaviourLogService.id)
			?.add(who, what, note);
	}

	release(ids: string[], names: string[] = []): void {
		this.entries.release(ids);
		for (const name of names) this.log(name, "Released from Focus Mode");
	}

	/** Records freezes that ended because their time ran out. */
	logEnded(names: string[], everybody: boolean): void {
		for (const name of names) this.log(name, "Focus Mode time ended");
		if (everybody) this.log("Everybody", "Focus Mode time ended");
	}

	releaseAll(): void {
		if (!this.entries.isEmpty()) this.log("Everybody", "Released from Focus Mode");
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

	/** Chat is muted once per session, and again if the student rejoins. */
	private setMuted(player: Player, muted: boolean): void {
		try {
			player.runCommand(`ability @s mute ${muted}`);
		} catch (e) {
			console.warn(`Could not change mute for ${player.name}: ${e}`);
			if (!this.muteFailureReported) {
				this.muteFailureReported = true;
				this.students.notifyTeacher("§cCould not mute chat on this device.");
			}
			return;
		}
		if (muted) this.mutedThisSession.add(player.id);
		else this.mutedThisSession.delete(player.id);
		player.setDynamicProperty("focus_muted", muted);
	}

	forgetSession(playerId: string): void {
		this.mutedThisSession.delete(playerId);
	}

	applyFreeze(player: Player, entry: TimedEntry<FocusData>): void {
		player.setDynamicProperty("focus_mode", true);
		if (entry.data.mute && !this.mutedThisSession.has(player.id)) {
			this.setMuted(player, true);
		} else if (!entry.data.mute && player.getDynamicProperty("focus_muted")) {
			this.setMuted(player, false);
		}
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
		if (player.getDynamicProperty("focus_muted")) {
			this.setMuted(player, false);
		}
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
