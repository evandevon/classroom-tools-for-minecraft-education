import { SceneContext } from "../scene_manager/scene-context.ts";
import { SceneManager } from "../scene_manager/scene-manager.ts";
import { ActionUIScene, ModalUIScene } from "../scene_manager/ui-scene.ts";
import {
	DEFAULT_DURATION_INDEX,
	describeSelection,
	DURATIONS,
	Selection,
} from "../students/timed-entries.ts";
import { heldStudents, statusFor } from "../students/held-students.ts";
import { FocusModeService } from "./focus_mode.service.ts";

export class FocusModeScene extends ActionUIScene {
	static readonly id = "focus_mode";

	constructor(
		sceneManager: SceneManager,
		context: SceneContext,
		service: FocusModeService,
	) {
		super(FocusModeScene.id, context.getSourcePlayer());
		this.setContext(context);
		this.setSimpleBody("edu_tools.ui.focus_mode.body");

		this.addButton(
			"edu_tools.ui.focus_mode.buttons.freeze",
			() => {
				const students = service.students.getOnlineStudents();
				if (students.length === 0) {
					sceneManager.openSceneWithContext(context, "not_enough_players", true);
					return;
				}
				sceneManager.openSceneWithContext(context, "player_select", true, {
					everybodyLabel: "§lEverybody§r (also covers students who join later)",
					players: students.map((s) => ({
						id: s.id,
						name: s.name,
						status: statusFor(service.getEntries().effective(s.id), "Frozen"),
					})),
					onSelected: (selection: Selection) => {
						sceneManager.openSceneWithContext(
							context,
							FocusModeSettingsScene.id,
							true,
							selection,
						);
					},
				});
			},
			"textures/edu_tools/ui/main/focus_mode",
		);

		this.addButton(
			"edu_tools.ui.focus_mode.buttons.release",
			() => {
				const held = heldStudents(
					service.students.getOnlineStudents(),
					service.getEntries(),
					"Frozen",
				);
				if (held.length === 0) {
					this.player.sendMessage("§eNobody is frozen.");
					return;
				}
				sceneManager.openSceneWithContext(context, "player_select", true, {
					everybodyLabel: "§lEverybody§r",
					players: held,
					onSelected: (selection: Selection) => {
						if (selection.everybody) service.releaseAll();
						else service.release(selection.players.map((p) => p.id));
						this.player.sendMessage(
							`§aReleased: ${describeSelection(selection)}`,
						);
					},
				});
			},
			"textures/edu_tools/ui/focus_mode/global_disable",
		);

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

export class FocusModeSettingsScene extends ModalUIScene {
	static readonly id = "focus_mode_settings";

	constructor(
		sceneManager: SceneManager,
		context: SceneContext,
		service: FocusModeService,
		selection: Selection,
	) {
		super(FocusModeSettingsScene.id, context.getSourcePlayer());
		this.setContext(context);

		let minutes: number | null = DURATIONS[DEFAULT_DURATION_INDEX].minutes;
		let message = "";
		this.addDropdown(
			`How long should ${describeSelection(selection)} stay frozen?`,
			DURATIONS.map((d) => d.label),
			(index: number) => {
				minutes = DURATIONS[index].minutes;
			},
			{ defaultValueIndex: DEFAULT_DURATION_INDEX },
		);
		this.addTextField(
			"Message on their screen (optional)",
			"Please see your teacher",
			(value: string) => {
				message = value.trim();
			},
		);

		this.show(context.getSourcePlayer(), sceneManager).then((r) => {
			if (r.canceled) return;
			service.freeze(selection, minutes, { message });
			this.player.sendMessage(
				`§aFrozen: ${describeSelection(selection)} (${
					minutes === null ? "until you release them" : `${minutes} min`
				})`,
			);
		});
	}
}
