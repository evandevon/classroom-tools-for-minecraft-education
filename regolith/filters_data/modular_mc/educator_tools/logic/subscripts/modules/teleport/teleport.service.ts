import { Player, world } from "@minecraft/server";
import { Module, ModuleManager } from "../../module-manager.ts";
import { ButtonConfig } from "../main/main.service.ts";
import { SceneContext } from "../scene_manager/scene-context.ts";
import { SceneManager } from "../scene_manager/scene-manager.ts";
import { ActionUIScene } from "../scene_manager/ui-scene.ts";
import { StudentsService } from "../students/students.service.ts";
import { describeSelection, Selection } from "../students/timed-entries.ts";

export class TeleportService implements Module {
	static readonly id = "teleport";
	public readonly id = TeleportService.id;

	constructor(private readonly moduleManager: ModuleManager) {}

	registerScenes(sceneManager: SceneManager): void {
		sceneManager.registerScene(
			TeleportScene.id,
			(manager: SceneManager, context: SceneContext, selection: Selection) => {
				new TeleportScene(manager, context, this, selection);
			},
		);
	}

	getMainButton(): ButtonConfig {
		return {
			labelKey: "edu_tools.ui.main.buttons.teleport",
			iconPath: "textures/edu_tools/ui/main/teleport",
			handler: (sceneManager: SceneManager, context: SceneContext) => {
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
							TeleportScene.id,
							true,
							selection,
						);
					},
				});
			},
			weight: 50,
		};
	}

	students(): StudentsService {
		return this.moduleManager.getModule<StudentsService>(StudentsService.id)!;
	}

	teleport(selection: Selection, destination: Player): void {
		for (const { id } of selection.players) {
			if (id === destination.id) continue;
			const player = world.getEntity(id) as Player | undefined;
			player?.teleport(destination.location, {
				dimension: destination.dimension,
				rotation: destination.getRotation(),
			});
		}
	}
}

class TeleportScene extends ActionUIScene {
	static readonly id = "teleport";

	constructor(
		sceneManager: SceneManager,
		context: SceneContext,
		service: TeleportService,
		selection: Selection,
	) {
		super(TeleportScene.id, context.getSourcePlayer());
		this.setContext(context);
		this.setRawBody([{ text: `Send ${describeSelection(selection)} to:` }]);

		const go = (destination: Player) => {
			service.teleport(selection, destination);
			this.player.sendMessage(
				`§aTeleported ${describeSelection(selection)} to ${destination.name}.`,
			);
		};
		this.addButton("Me", () => go(this.player));
		for (const student of service.students().getOnlineStudents()) {
			this.addButton(student.name, () => go(student));
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
