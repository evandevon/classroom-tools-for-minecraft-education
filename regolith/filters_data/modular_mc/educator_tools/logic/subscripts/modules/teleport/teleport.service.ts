import { Player, Vector3, world } from "@minecraft/server";
import { Module, ModuleManager } from "../../module-manager.ts";
import {
	BuildMarker,
	BuildMarkerService,
} from "../build_marker/build_marker.service.ts";
import { ButtonConfig } from "../main/main.service.ts";
import { SceneContext } from "../scene_manager/scene-context.ts";
import { SceneManager } from "../scene_manager/scene-manager.ts";
import { ActionUIScene, ModalUIScene } from "../scene_manager/ui-scene.ts";
import { StudentsService } from "../students/students.service.ts";
import { describeSelection, Selection } from "../students/timed-entries.ts";

export class TeleportService implements Module {
	static readonly id = "teleport";
	public readonly id = TeleportService.id;

	constructor(private readonly moduleManager: ModuleManager) {}

	registerScenes(sceneManager: SceneManager): void {
		sceneManager.registerScene(
			TeleportMenuScene.id,
			(manager: SceneManager, context: SceneContext) => {
				new TeleportMenuScene(manager, context, this);
			},
		);
		sceneManager.registerScene(
			TeleportSelfScene.id,
			(manager: SceneManager, context: SceneContext) => {
				new TeleportSelfScene(manager, context, this);
			},
		);
		sceneManager.registerScene(
			TeleportCoordinatesScene.id,
			(manager: SceneManager, context: SceneContext) => {
				new TeleportCoordinatesScene(manager, context);
			},
		);
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
				sceneManager.openSceneWithContext(context, TeleportMenuScene.id, true);
			},
			weight: 50,
		};
	}

	students(): StudentsService {
		return this.moduleManager.getModule<StudentsService>(StudentsService.id)!;
	}

	markers(): { studentId: string; marker: BuildMarker }[] {
		return this.moduleManager.getModule<BuildMarkerService>(
			BuildMarkerService.id,
		)?.getMarkers() ?? [];
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

/** Reads "100 64 -20" (spaces or commas). */
export function parseCoordinates(text: string): Vector3 | undefined {
	const parts = text.trim().split(/[\s,]+/).map(Number);
	if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
		return undefined;
	}
	return { x: parts[0], y: parts[1], z: parts[2] };
}

class TeleportMenuScene extends ActionUIScene {
	static readonly id = "teleport_menu";

	constructor(
		sceneManager: SceneManager,
		context: SceneContext,
		service: TeleportService,
	) {
		super(TeleportMenuScene.id, context.getSourcePlayer());
		this.setContext(context);
		this.setSimpleBody("edu_tools.ui.teleport_menu.body");

		this.addButton("edu_tools.ui.teleport_menu.self", () => {
			sceneManager.openSceneWithContext(context, TeleportSelfScene.id, true);
		});
		this.addButton("edu_tools.ui.teleport_menu.send", () => {
			const students = service.students().getOnlineStudents();
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
		});
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

class TeleportSelfScene extends ActionUIScene {
	static readonly id = "teleport_self";

	constructor(
		sceneManager: SceneManager,
		context: SceneContext,
		service: TeleportService,
	) {
		super(TeleportSelfScene.id, context.getSourcePlayer());
		this.setContext(context);
		this.setSimpleBody("edu_tools.ui.teleport_self.body");
		for (const student of service.students().getOnlineStudents()) {
			this.addButton(student.name, () => {
				this.player.teleport(student.location, {
					dimension: student.dimension,
				});
			});
		}
		for (const { marker } of service.markers()) {
			this.addButton(
				`${marker.name}'s marker`,
				() => {
					this.player.teleport(marker.location, {
						dimension: world.getDimension(marker.dimensionId),
					});
				},
				"textures/edu_tools/ui/main/build_markers",
			);
		}
		this.addButton("edu_tools.ui.teleport_self.coordinates", () => {
			sceneManager.openSceneWithContext(
				context,
				TeleportCoordinatesScene.id,
				true,
			);
		});
		this.addButton(
			"edu_tools.ui.buttons.back",
			() => {
				sceneManager.goBackToScene(context, TeleportMenuScene.id);
			},
			"textures/edu_tools/ui/_general/back",
		);
		this.show(context.getSourcePlayer(), sceneManager);
	}
}

class TeleportCoordinatesScene extends ModalUIScene {
	static readonly id = "teleport_coordinates";

	constructor(sceneManager: SceneManager, context: SceneContext) {
		super(TeleportCoordinatesScene.id, context.getSourcePlayer());
		this.setContext(context);
		let text = "";
		this.addTextField(
			"Where to? Enter X Y Z",
			"100 64 -20",
			(value: string) => {
				text = value;
			},
		);
		this.show(context.getSourcePlayer(), sceneManager).then((r) => {
			if (r.canceled) return;
			const location = parseCoordinates(text);
			if (!location) {
				this.player.sendMessage(
					"§eThat didn't work. Enter three numbers, like 100 64 -20.",
				);
				return;
			}
			this.player.teleport(location);
		});
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
		for (const { marker } of service.markers()) {
			this.addButton(
				`${marker.name}'s marker`,
				() => {
					for (const { id } of selection.players) {
						(world.getEntity(id) as Player | undefined)?.teleport(
							marker.location,
							{ dimension: world.getDimension(marker.dimensionId) },
						);
					}
					this.player.sendMessage(
						`§aTeleported ${describeSelection(selection)} to ${marker.name}'s marker.`,
					);
				},
				"textures/edu_tools/ui/main/build_markers",
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
