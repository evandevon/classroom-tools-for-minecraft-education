import { world } from "@minecraft/server";
import { SceneContext } from "../scene_manager/scene-context.ts";
import { SceneManager } from "../scene_manager/scene-manager.ts";
import { ActionUIScene, ModalUIScene } from "../scene_manager/ui-scene.ts";
import {
	DEFAULT_DURATION_INDEX,
	describeSelection,
	DURATIONS,
	loadChoices,
	saveChoices,
	Selection,
} from "../students/timed-entries.ts";
import { heldStudents, statusFor } from "../students/held-students.ts";
import { FocusModeService } from "./focus_mode.service.ts";

export function openFreezePicker(
	sceneManager: SceneManager,
	context: SceneContext,
	service: FocusModeService,
): void {
	const students = service.students.getOnlineStudents();
	// With nobody online yet, Everybody can still be set for students who join.
	sceneManager.openSceneWithContext(context, "player_select", true, {
		everybodyLabel: "§lEverybody§r (also covers students who join later)",
		players: students.map((s) => ({
			id: s.id,
			name: s.name,
			status: statusFor(service.getEntries().effective(s.id), "In Focus"),
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
}

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
				openFreezePicker(sceneManager, context, service);
			},
			"textures/edu_tools/ui/main/focus_mode",
		);

		this.addButton(
			"edu_tools.ui.focus_mode.buttons.release",
			() => {
				const held = heldStudents(
					service.students.getOnlineStudents(),
					service.getEntries(),
					"In Focus",
				);
				if (held.length === 0) {
					this.player.sendMessage("§eNobody is in Focus Mode.");
					return;
				}
				sceneManager.openSceneWithContext(context, "player_select", true, {
					everybodyLabel: "§lEverybody§r",
					players: held,
					onSelected: (selection: Selection) => {
						if (selection.everybody) service.releaseAll();
						else {
							service.release(
								selection.players.map((p) => p.id),
								selection.players.map((p) => p.name),
							);
						}
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

		const saved = loadChoices(world, "focus_choices", {
			duration: DEFAULT_DURATION_INDEX,
			mute: true,
		});
		let durationIndex = saved.duration;
		let mute = saved.mute;
		let message = "";
		this.addDropdown(
			`How long should ${describeSelection(selection)} stay in Focus Mode?`,
			DURATIONS.map((d) => d.label),
			(index: number) => {
				durationIndex = index;
			},
			{ defaultValueIndex: saved.duration },
		);
		this.addTextField(
			"Message on their screen (optional)",
			"Please see your teacher",
			(value: string) => {
				message = value.trim();
			},
		);

		this.addToggle(
			"Stop them using chat",
			(value: boolean) => {
				mute = value;
			},
			{ defaultValue: saved.mute },
		);

		this.show(context.getSourcePlayer(), sceneManager).then((r) => {
			if (r.canceled) return;
			saveChoices(world, "focus_choices", { duration: durationIndex, mute });
			const minutes = DURATIONS[durationIndex].minutes;
			service.freeze(selection, minutes, { message, mute });
			this.player.sendMessage(
				`§aIn Focus Mode: ${describeSelection(selection)} (${
					minutes === null ? "until you release them" : `${minutes} min`
				})`,
			);
		});
	}
}
