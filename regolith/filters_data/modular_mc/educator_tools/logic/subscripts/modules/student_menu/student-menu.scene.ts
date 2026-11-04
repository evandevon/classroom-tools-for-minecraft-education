import { ModuleManager } from "../../module-manager.ts";
import { BuildMarkerService } from "../build_marker/build_marker.service.ts";
import { HelpService } from "../help/help.service.ts";
import { SceneContext } from "../scene_manager/scene-context.ts";
import { SceneManager } from "../scene_manager/scene-manager.ts";
import { ActionUIScene } from "../scene_manager/ui-scene.ts";
import { ShowcaseService } from "../showcase/showcase.service.ts";
import { StudentsService } from "../students/students.service.ts";
import { TeleportRequestsService } from "../teleport_requests/teleport_requests.service.ts";

/**
 * Everything a student can do, from one item. Teachers get the same menu, so
 * what they demonstrate on the board matches what students see.
 */
export class StudentMenuScene extends ActionUIScene {
	static readonly id = "student_menu";

	constructor(
		sceneManager: SceneManager,
		context: SceneContext,
		markers: BuildMarkerService,
	) {
		super(StudentMenuScene.id, context.getSourcePlayer());
		this.setContext(context);
		this.setSimpleBody("edu_tools.ui.student_menu.body");
		const modules = ModuleManager.getInstance();
		const help = modules.getModule<HelpService>(HelpService.id)!;
		const students = modules.getModule<StudentsService>(StudentsService.id)!;
		const showcase = modules.getModule<ShowcaseService>(ShowcaseService.id);
		const requests = modules.getModule<TeleportRequestsService>(
			TeleportRequestsService.id,
		);
		const player = this.player;

		this.addButton(
			help.hasFlag(player.id)
				? "edu_tools.ui.student_menu.help_off"
				: "edu_tools.ui.student_menu.help_on",
			() => help.toggleFlag(player),
			"textures/edu_tools/ui/main/help_flag",
		);

		if (showcase?.isActive()) {
			this.addButton(
				"edu_tools.ui.student_menu.showcase_visit",
				() => {
					sceneManager.openSceneWithContext(context, "showcase_builds", true);
				},
				"textures/edu_tools/ui/main/build_markers",
			);
		} else {
			this.addButton(
				"edu_tools.ui.student_menu.place",
				() => markers.placeForPlayer(player),
				"textures/edu_tools/ui/main/build_markers",
			);
		}

		this.addButton(
			"edu_tools.ui.student_menu.return",
			() => markers.returnToBuild(player),
			"textures/edu_tools/ui/main/teleport",
		);

		if (requests?.isActive() && !showcase?.isActive()) {
			this.addButton(
				"edu_tools.ui.student_menu.visit",
				() => {
					sceneManager.openSceneWithContext(context, "visit_list", true);
				},
				"textures/edu_tools/ui/main/teleport",
			);
		}

		if (students.isHelper(player.id) || students.isTeacher(player.id)) {
			const waiting = help.waitingCount();
			this.addButton(
				{
					rawtext: [
						{ translate: "edu_tools.ui.student_menu.help_requests" },
						{ text: waiting ? ` (${waiting})` : "" },
					],
				},
				() => {
					sceneManager.openSceneWithContext(context, "help_requests", true);
				},
				"textures/edu_tools/ui/main/help_flag",
			);
		}

		this.show(player, sceneManager);
	}
}
