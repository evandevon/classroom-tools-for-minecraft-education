import { world } from "@minecraft/server";
import { SceneContext } from "../scene_manager/scene-context.ts";
import { SceneManager } from "../scene_manager/scene-manager.ts";
import { ActionUIScene, ModalUIScene } from "../scene_manager/ui-scene.ts";
import { heldStudents, statusFor } from "../students/held-students.ts";
import {
	DEFAULT_DURATION_INDEX,
	describeSelection,
	DURATIONS,
	loadChoices,
	saveChoices,
	Selection,
} from "../students/timed-entries.ts";
import { LockCentre, LockPlayerService } from "./lock_player.service.ts";

export function openLockPicker(
	sceneManager: SceneManager,
	context: SceneContext,
	service: LockPlayerService,
): void {
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
			status: statusFor(service.getEntries().effective(s.id), "Locked"),
		})),
		onSelected: (selection: Selection) => {
			sceneManager.openSceneWithContext(
				context,
				LockPlayerSettingsScene.id,
				true,
				selection,
			);
		},
	});
}

export class LockPlayerScene extends ActionUIScene {
	static readonly id = "lock_player";

	constructor(
		sceneManager: SceneManager,
		context: SceneContext,
		service: LockPlayerService,
	) {
		super(LockPlayerScene.id, context.getSourcePlayer());
		this.setContext(context);
		this.setSimpleBody("edu_tools.ui.lock_player.body");

		this.addButton(
			"edu_tools.ui.lock_player.buttons.lock",
			() => {
				openLockPicker(sceneManager, context, service);
			},
			"textures/edu_tools/ui/main/lock_player",
		);

		this.addButton(
			"edu_tools.ui.lock_player.buttons.release",
			() => {
				const held = heldStudents(
					service.students.getOnlineStudents(),
					service.getEntries(),
					"Locked",
				);
				if (held.length === 0) {
					this.player.sendMessage("§eNobody is locked.");
					return;
				}
				sceneManager.openSceneWithContext(context, "player_select", true, {
					everybodyLabel: "§lEverybody§r",
					players: held,
					onSelected: (selection: Selection) => {
						if (selection.everybody) service.releaseAll();
						else service.release(selection.players.map((p) => p.id));
						this.player.sendMessage(
							`§aUnlocked: ${describeSelection(selection)}`,
						);
					},
				});
			},
			"textures/edu_tools/ui/lock_player/delete_lock",
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

const CENTRES: { label: string; value: LockCentre }[] = [
	{ label: "Around each student, where they are now", value: "each" },
	{ label: "Around where I'm standing now", value: "point" },
	{ label: "Around me, following me as I move", value: "follow" },
];

export class LockPlayerSettingsScene extends ModalUIScene {
	static readonly id = "lock_player_settings";

	constructor(
		sceneManager: SceneManager,
		context: SceneContext,
		service: LockPlayerService,
		selection: Selection,
	) {
		super(LockPlayerSettingsScene.id, context.getSourcePlayer());
		this.setContext(context);

		const saved = loadChoices(world, "lock_choices", {
			duration: DEFAULT_DURATION_INDEX,
			centre: 0,
			radius: 16,
			showBoundary: true,
		});
		const choices = { ...saved };

		this.addDropdown(
			`How long should ${describeSelection(selection)} stay locked?`,
			DURATIONS.map((d) => d.label),
			(index: number) => {
				choices.duration = index;
			},
			{ defaultValueIndex: saved.duration },
		);
		this.addDropdown(
			"Where is the area?",
			CENTRES.map((c) => c.label),
			(index: number) => {
				choices.centre = index;
			},
			{ defaultValueIndex: saved.centre },
		);
		this.addSlider(
			"How far can they move? (blocks)",
			5,
			150,
			(value: number) => {
				choices.radius = value;
			},
			{ defaultValue: saved.radius, valueStep: 1 },
		);
		this.addToggle(
			"Show the edge of the area",
			(value: boolean) => {
				choices.showBoundary = value;
			},
			{ defaultValue: saved.showBoundary },
		);

		this.show(context.getSourcePlayer(), sceneManager).then((r) => {
			if (r.canceled) return;
			saveChoices(world, "lock_choices", choices);
			const teacher = this.player;
			const minutes = DURATIONS[choices.duration].minutes;
			const centre = CENTRES[choices.centre].value;
			const { radius, showBoundary } = choices;
			service.lock(selection, minutes, {
				radius,
				centre,
				showBoundary,
				point: centre === "point" ? teacher.location : undefined,
				dimensionId: centre === "point" ? teacher.dimension.id : undefined,
				followId: centre === "follow" ? teacher.id : undefined,
			});
			teacher.sendMessage(
				`§aLocked: ${describeSelection(selection)} (${radius} blocks, ${
					minutes === null ? "until you release them" : `${minutes} min`
				})`,
			);
		});
	}
}
