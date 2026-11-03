import { GameMode, Player, world } from "@minecraft/server";
import { Module, ModuleManager } from "../../module-manager.ts";
import { FocusModeService } from "../focus_mode/focus_mode.service.ts";
import { ButtonConfig } from "../main/main.service.ts";
import { SceneContext } from "../scene_manager/scene-context.ts";
import { SceneManager } from "../scene_manager/scene-manager.ts";
import { ActionUIScene } from "../scene_manager/ui-scene.ts";
import { ShowcaseService } from "../showcase/showcase.service.ts";
import { StudentsService } from "../students/students.service.ts";
import { describeSelection, Selection } from "../students/timed-entries.ts";

export class GamemodeService implements Module {
	static readonly id = "gamemode";
	public readonly id = GamemodeService.id;

	constructor(private readonly moduleManager: ModuleManager) {}

	registerScenes(sceneManager: SceneManager): void {
		sceneManager.registerScene(
			SetGamemodeScene.id,
			(manager: SceneManager, context: SceneContext, selection: Selection) => {
				new SetGamemodeScene(manager, context, this, selection);
			},
		);
	}

	getMainButton(): ButtonConfig {
		return {
			labelKey: "edu_tools.ui.main.buttons.gamemode",
			iconPath: "textures/edu_tools/ui/main/gamemode",
			handler: (sceneManager: SceneManager, context: SceneContext) => {
				if (
					this.moduleManager.getModule<ShowcaseService>(ShowcaseService.id)
						?.isActive()
				) {
					context.getSourcePlayer().sendMessage(
						"§eEnd the showcase before changing game modes.",
					);
					return;
				}
				const students = this.students().getOnlineStudents();
				if (students.length === 0) {
					sceneManager.openSceneWithContext(context, "not_enough_players", true);
					return;
				}
				sceneManager.openSceneWithContext(context, "player_select", true, {
					everybodyLabel: "§lEverybody§r",
					players: students.map((s) => ({ id: s.id, name: s.name })),
					onSelected: (selection: Selection) => {
						sceneManager.openSceneWithContext(
							context,
							SetGamemodeScene.id,
							true,
							selection,
						);
					},
				});
			},
			weight: 60,
		};
	}

	private students(): StudentsService {
		return this.moduleManager.getModule<StudentsService>(StudentsService.id)!;
	}

	/** Returns how many of those students are frozen and so stay in Spectator. */
	setGamemode(selection: Selection, gamemode: GameMode): number {
		const focus = this.moduleManager.getModule<FocusModeService>(
			FocusModeService.id,
		);
		let frozen = 0;
		for (const { id } of selection.players) {
			const player = world.getEntity(id) as Player | undefined;
			if (!player) continue;
			if (focus?.isFrozen(id)) frozen++;
			else player.setGameMode(gamemode);
		}
		return frozen;
	}
}

class SetGamemodeScene extends ActionUIScene {
	static readonly id = "set_gamemode";

	constructor(
		sceneManager: SceneManager,
		context: SceneContext,
		service: GamemodeService,
		selection: Selection,
	) {
		super(SetGamemodeScene.id, context.getSourcePlayer());
		this.setContext(context);
		this.setRawBody([{ text: `Choose a game mode for ${describeSelection(selection)}.` }]);

		for (const gamemode of Object.values(GameMode)) {
			const name = String(gamemode).toLowerCase();
			this.addButton(
				`edu_tools.ui.set_gamemode.buttons.${name}`,
				() => {
					const frozen = service.setGamemode(selection, gamemode);
					this.player.sendMessage(
						frozen
							? `§eGame mode changed. ${frozen} student(s) in Focus Mode were skipped: release them first.`
							: `§aGame mode changed for ${describeSelection(selection)}.`,
					);
				},
				`textures/edu_tools/ui/set_gamemode/${name}`,
			);
		}
		this.addButton(
			"edu_tools.ui.buttons.back",
			() => {
				sceneManager.goBackToScene(context, "main");
			},
			"textures/edu_tools/ui/_general/back",
		);
		this.show(context.getSourcePlayer(), sceneManager);
	}
}
