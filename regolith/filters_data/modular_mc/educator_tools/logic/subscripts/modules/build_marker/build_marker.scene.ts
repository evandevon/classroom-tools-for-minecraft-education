import { SceneContext } from "../scene_manager/scene-context.ts";
import { SceneManager } from "../scene_manager/scene-manager.ts";
import { ActionUIScene } from "../scene_manager/ui-scene.ts";
import { describeSelection, Selection } from "../students/timed-entries.ts";
import {
	BuildMarkerService,
	markerLabel,
} from "./build_marker.service.ts";

export class BuildMarkersScene extends ActionUIScene {
	static readonly id = "build_markers";

	constructor(
		sceneManager: SceneManager,
		context: SceneContext,
		service: BuildMarkerService,
	) {
		super(BuildMarkersScene.id, context.getSourcePlayer());
		this.setContext(context);
		const markers = service.getMarkers();
		this.setSimpleBody(
			markers.length
				? "edu_tools.ui.build_markers.body"
				: "edu_tools.ui.build_markers.empty",
		);
		for (const { studentId, marker } of markers) {
			this.addButton(
				marker.name,
				() => {
					sceneManager.openSceneWithContext(
						context,
						BuildMarkerScene.id,
						true,
						studentId,
					);
				},
				"textures/edu_tools/ui/main/build_markers",
			);
		}
		if (markers.length) {
			this.addButton(
				"edu_tools.ui.build_markers.remove_all",
				() => {
					service.removeAll();
					this.player.sendMessage("§aAll Build Markers have been removed.");
				},
				"textures/edu_tools/ui/lock_player/delete_lock",
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

export class BuildMarkerScene extends ActionUIScene {
	static readonly id = "build_marker";

	constructor(
		sceneManager: SceneManager,
		context: SceneContext,
		service: BuildMarkerService,
		studentId: string,
	) {
		super(BuildMarkerScene.id, context.getSourcePlayer());
		this.setContext(context);
		const marker = service.getMarker(studentId);
		if (!marker) {
			this.player.sendMessage("§eThat marker has been removed.");
			return;
		}
		this.setRawBody([{ text: markerLabel(marker) }]);

		this.addButton("edu_tools.ui.build_marker.go", () => {
			service.teleportSelection(
				{ everybody: false, players: [{ id: this.player.id, name: "" }] },
				marker,
			);
		});
		this.addButton("edu_tools.ui.build_marker.send", () => {
			const students = service.students.getOnlineStudents();
			if (students.length === 0) {
				sceneManager.openSceneWithContext(context, "not_enough_players", true);
				return;
			}
			sceneManager.openSceneWithContext(context, "player_select", true, {
				everybodyLabel: "§lEverybody§r",
				players: students.map((s) => ({ id: s.id, name: s.name })),
				onSelected: (selection: Selection) => {
					service.teleportSelection(selection, marker);
					this.player.sendMessage(
						`§aSent ${describeSelection(selection)} to ${marker.name}'s build.`,
					);
				},
			});
		});
		this.addButton(
			"edu_tools.ui.build_marker.remove",
			() => {
				service.remove(studentId);
				this.player.sendMessage(`§aRemoved ${marker.name}'s marker.`);
			},
			"textures/edu_tools/ui/lock_player/delete_lock",
		);
		this.addButton(
			"edu_tools.ui.buttons.back",
			() => {
				sceneManager.goBackToScene(context, BuildMarkersScene.id);
			},
			"textures/edu_tools/ui/_general/back",
		);
		this.show(context.getSourcePlayer(), sceneManager);
	}
}
