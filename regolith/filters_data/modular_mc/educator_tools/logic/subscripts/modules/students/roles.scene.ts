import { SceneContext } from "../scene_manager/scene-context.ts";
import { SceneManager } from "../scene_manager/scene-manager.ts";
import { ActionUIScene } from "../scene_manager/ui-scene.ts";
import { StudentsService } from "./students.service.ts";
import { Selection } from "./timed-entries.ts";

const names = (selection: Selection) =>
	selection.players.map((p) => p.name).join(", ");

/** Teachers assign other teachers and trusted students here. */
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
		const trusted = Object.entries(service.getTrustedStudents());
		const list = (items: [string, string][]) =>
			items.map(([, name]) => name).join(", ") || "nobody";
		this.setRawBody([{
			text:
				`§lAssigned teachers:§r ${list(teachers)}\n§lTrusted students:§r ${list(trusted)}\n\nTeachers have full control. Trusted students can travel to students and markers, but can't manage others.`,
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
		this.addButton("edu_tools.ui.roles.add_trusted", () => {
			pick(
				online().filter((s) => !service.isTrustedStudent(s.id)),
				(selection) => {
					service.addTrustedStudents(selection.players);
					this.player.sendMessage(`§aNow trusted: ${names(selection)}`);
				},
			);
		});
		if (trusted.length) {
			this.addButton("edu_tools.ui.roles.remove_trusted", () => {
				pick(trusted.map(([id, name]) => ({ id, name })), (selection) => {
					for (const { id } of selection.players) {
						service.removeTrustedStudent(id);
					}
					this.player.sendMessage(`§aNo longer trusted: ${names(selection)}`);
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
