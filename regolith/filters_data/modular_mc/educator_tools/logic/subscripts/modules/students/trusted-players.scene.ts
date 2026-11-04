import { SceneContext } from "../scene_manager/scene-context.ts";
import { SceneManager } from "../scene_manager/scene-manager.ts";
import { ActionUIScene } from "../scene_manager/ui-scene.ts";
import { StudentsService } from "./students.service.ts";
import { Selection } from "./timed-entries.ts";

/** Only the teacher can reach this screen. */
export class TrustedPlayersScene extends ActionUIScene {
	static readonly id = "trusted_players";

	constructor(
		sceneManager: SceneManager,
		context: SceneContext,
		service: StudentsService,
	) {
		super(TrustedPlayersScene.id, context.getSourcePlayer());
		this.setContext(context);
		const trusted = Object.entries(service.getTrusted());
		const names = trusted.map(([, name]) => name).join(", ");
		this.setRawBody([{
			text: `Trusted players can use every tool except this screen.\n\n§lTrusted now:§r ${
				names || "nobody"
			}`,
		}]);

		this.addButton("edu_tools.ui.trusted_players.add", () => {
			const students = service.getOnlineStudents();
			if (students.length === 0) {
				sceneManager.openSceneWithContext(context, "not_enough_players", true);
				return;
			}
			sceneManager.openSceneWithContext(context, "player_select", true, {
				players: students.map((s) => ({ id: s.id, name: s.name })),
				onSelected: (selection: Selection) => {
					service.addTrusted(selection.players);
					this.player.sendMessage(
						`§aNow trusted: ${selection.players.map((p) => p.name).join(", ")}`,
					);
				},
			});
		});
		if (trusted.length) {
			this.addButton(
				"edu_tools.ui.trusted_players.remove",
				() => {
					sceneManager.openSceneWithContext(context, "player_select", true, {
						players: trusted.map(([id, name]) => ({ id, name })),
						onSelected: (selection: Selection) => {
							for (const { id } of selection.players) service.removeTrusted(id);
							this.player.sendMessage(
								`§aNo longer trusted: ${
									selection.players.map((p) => p.name).join(", ")
								}`,
							);
						},
					});
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
