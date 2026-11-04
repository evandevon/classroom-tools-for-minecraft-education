import { SceneContext } from "../scene_manager/scene-context.ts";
import { SceneManager } from "../scene_manager/scene-manager.ts";
import { ActionUIScene } from "../scene_manager/ui-scene.ts";
import { StudentsService } from "./students.service.ts";
import { Selection } from "./timed-entries.ts";

const names = (selection: Selection) =>
	selection.players.map((p) => p.name).join(", ");

/** Teachers assign other teachers and helpers here. */
export class RolesScene extends ActionUIScene {
	static readonly id = "roles";

	constructor(
		sceneManager: SceneManager,
		context: SceneContext,
		service: StudentsService,
	) {
		super(RolesScene.id, context.getSourcePlayer());
		this.setContext(context);
		const teachers = Object.entries(service.getAssignedTeachers());
		const helpers = Object.entries(service.getHelpers());
		const list = (items: [string, string][]) =>
			items.map(([, name]) => name).join(", ") || "nobody";
		this.setRawBody([{
			text:
				`§lAssigned teachers:§r ${list(teachers)}\n§lHelpers:§r ${list(helpers)}\n\nTeachers have full control. Helpers can only teleport to students who have put up a help flag.`,
		}]);

		const pick = (
			players: { id: string; name: string }[],
			apply: (selection: Selection) => void,
		) => {
			if (players.length === 0) {
				sceneManager.openSceneWithContext(context, "not_enough_players", true);
				return;
			}
			sceneManager.openSceneWithContext(context, "player_select", true, {
				players,
				onSelected: apply,
			});
		};
		const online = () =>
			service.getOnlineStudents().map((s) => ({ id: s.id, name: s.name }));

		this.addButton("edu_tools.ui.roles.add_teacher", () => {
			pick(online(), (selection) => {
				service.addTeachers(selection.players);
				this.player.sendMessage(`§aNow a teacher: ${names(selection)}`);
			});
		});
		if (teachers.length) {
			this.addButton("edu_tools.ui.roles.remove_teacher", () => {
				pick(teachers.map(([id, name]) => ({ id, name })), (selection) => {
					for (const { id } of selection.players) service.removeTeacher(id);
					this.player.sendMessage(`§aNo longer a teacher: ${names(selection)}`);
				});
			});
		}
		this.addButton("edu_tools.ui.roles.add_helper", () => {
			pick(online().filter((s) => !service.isHelper(s.id)), (selection) => {
				service.addHelpers(selection.players);
				this.player.sendMessage(`§aNow a helper: ${names(selection)}`);
			});
		});
		if (helpers.length) {
			this.addButton("edu_tools.ui.roles.remove_helper", () => {
				pick(helpers.map(([id, name]) => ({ id, name })), (selection) => {
					for (const { id } of selection.players) service.removeHelper(id);
					this.player.sendMessage(`§aNo longer a helper: ${names(selection)}`);
				});
			});
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
