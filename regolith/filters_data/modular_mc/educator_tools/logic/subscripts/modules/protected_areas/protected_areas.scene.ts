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
import type { ProtectedAreasService } from "./protected_areas.service.ts";

export class ProtectedAreasScene extends ActionUIScene {
	static readonly id = "protected_areas";

	constructor(
		sceneManager: SceneManager,
		context: SceneContext,
		service: ProtectedAreasService,
	) {
		super(ProtectedAreasScene.id, context.getSourcePlayer());
		this.setContext(context);

		const keptOut = heldStudents(
			service.students.getOnlineStudents(),
			service.getEntries(),
			"Kept out",
		);
		const areas = service.getTeacherAreas();
		const everybody = service.isEverybodyKeptOut();
		const keptOutText = everybody
			? "everybody"
			: keptOut.length
			? keptOut.map((p) => p.name).join(", ")
			: "nobody";
		this.setRawBody([{
			text:
				`§lKept out of other builds:§r ${keptOutText}\n§lTeacher-only areas:§r ${
					areas.length ? areas.map((a) => a.name).join(", ") : "none"
				}\n\nBuild edges show as §agreen§r particles and teacher-only areas as §9blue§r.`,
		}]);

		this.addButton(
			"edu_tools.ui.protected_areas.buttons.keep_out",
			() => {
				const students = service.students.getOnlineStudents();
				sceneManager.openSceneWithContext(context, "player_select", true, {
					everybodyLabel: "§lEverybody§r (also covers students who join later)",
					players: students.map((s) => ({
						id: s.id,
						name: s.name,
						status: statusFor(service.getEntries().effective(s.id), "Kept out"),
					})),
					onSelected: (selection: Selection) => {
						sceneManager.openSceneWithContext(
							context,
							KeepOutSettingsScene.id,
							true,
							selection,
						);
					},
				});
			},
			"textures/edu_tools/ui/main/build_markers",
		);

		this.addButton(
			"edu_tools.ui.protected_areas.buttons.let_in",
			() => {
				if (service.getEntries().isEmpty()) {
					this.player.sendMessage("§eNobody is kept out of builds.");
					return;
				}
				sceneManager.openSceneWithContext(context, "player_select", true, {
					everybodyLabel: "§lEverybody§r",
					players: keptOut,
					onSelected: (selection: Selection) => {
						if (selection.everybody) service.letEverybodyBackIn();
						else {
							service.letBackIn(
								selection.players.map((p) => p.id),
								selection.players.map((p) => p.name),
							);
						}
						this.player.sendMessage(
							`§aCan enter other builds again: ${describeSelection(selection)}`,
						);
					},
				});
			},
			"textures/edu_tools/ui/lock_player/delete_lock",
		);

		this.addButton(
			"edu_tools.ui.protected_areas.buttons.teacher_area",
			() => {
				sceneManager.openSceneWithContext(context, TeacherAreaSettingsScene.id, true);
			},
			"textures/edu_tools/ui/main/trusted_players",
		);

		if (areas.length) {
			this.addButton(
				"edu_tools.ui.protected_areas.buttons.teacher_areas",
				() => {
					sceneManager.openSceneWithContext(context, TeacherAreasScene.id, true);
				},
				"textures/edu_tools/ui/main/trusted_players",
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

export class KeepOutSettingsScene extends ModalUIScene {
	static readonly id = "keep_out_settings";

	constructor(
		sceneManager: SceneManager,
		context: SceneContext,
		service: ProtectedAreasService,
		selection: Selection,
	) {
		super(KeepOutSettingsScene.id, context.getSourcePlayer());
		this.setContext(context);
		const saved = loadChoices(world, "keep_out_choices", {
			duration: DEFAULT_DURATION_INDEX,
			radius: 12,
			showEdges: true,
		});
		const choices = { ...saved };

		this.addDropdown(
			`How long should ${describeSelection(selection)} be kept out of other builds?`,
			DURATIONS.map((d) => d.label),
			(index: number) => {
				choices.duration = index;
			},
			{ defaultValueIndex: saved.duration },
		);
		this.addSlider(
			"How big is each build? (blocks from its marker)",
			3,
			60,
			(value: number) => {
				choices.radius = value;
			},
			{ defaultValue: saved.radius, valueStep: 1 },
		);
		this.addToggle(
			"Show the edges of builds",
			(value: boolean) => {
				choices.showEdges = value;
			},
			{ defaultValue: saved.showEdges },
		);

		this.show(context.getSourcePlayer(), sceneManager).then((r) => {
			if (r.canceled) return;
			saveChoices(world, "keep_out_choices", choices);
			const minutes = DURATIONS[choices.duration].minutes;
			service.keepOut(selection, minutes, {
				radius: choices.radius,
				showEdges: choices.showEdges,
			});
			const missing = (selection.everybody
				? service.students.getOnlineStudents()
				: selection.players)
				.filter((p) => !service.hasMarker(p.id))
				.map((p) => p.name);
			this.player.sendMessage(
				`§aKept out of other builds: ${describeSelection(selection)} (${choices.radius} blocks, ${
					minutes === null ? "until you allow them back" : `${minutes} min`
				})`,
			);
			if (missing.length) {
				this.player.sendMessage(
					`§eNo marker yet, so their own build isn't protected: ${missing.join(", ")}`,
				);
			}
		});
	}
}

export class TeacherAreaSettingsScene extends ModalUIScene {
	static readonly id = "teacher_area_settings";

	constructor(
		sceneManager: SceneManager,
		context: SceneContext,
		service: ProtectedAreasService,
	) {
		super(TeacherAreaSettingsScene.id, context.getSourcePlayer());
		this.setContext(context);
		const saved = loadChoices(world, "teacher_area_choices", {
			radius: 10,
			showEdges: true,
		});
		const choices = { ...saved, name: "" };

		this.addTextField(
			"Name (optional)",
			"e.g. Teacher's desk",
			(value: string) => {
				choices.name = value;
			},
		);
		this.addSlider(
			"How big? (blocks from where you're standing)",
			3,
			60,
			(value: number) => {
				choices.radius = value;
			},
			{ defaultValue: saved.radius, valueStep: 1 },
		);
		this.addToggle(
			"Show the edge",
			(value: boolean) => {
				choices.showEdges = value;
			},
			{ defaultValue: saved.showEdges },
		);

		this.show(context.getSourcePlayer(), sceneManager).then((r) => {
			if (r.canceled) return;
			saveChoices(world, "teacher_area_choices", {
				radius: choices.radius,
				showEdges: choices.showEdges,
			});
			const area = service.addTeacherArea(
				this.player,
				choices.name,
				choices.radius,
				choices.showEdges,
			);
			this.player.sendMessage(
				`§9Teacher-only area made: ${area.name} (${area.radius} blocks around here). Students inside will be moved out.`,
			);
		});
	}
}

/** One switch per teacher-only area: on keeps it, off removes it. */
export class TeacherAreasScene extends ModalUIScene {
	static readonly id = "teacher_areas";

	constructor(
		sceneManager: SceneManager,
		context: SceneContext,
		service: ProtectedAreasService,
	) {
		super(TeacherAreasScene.id, context.getSourcePlayer());
		this.setContext(context);
		const areas = service.getTeacherAreas();
		const keep = new Map<string, boolean>();
		for (const area of areas) {
			const { x, z } = area.center;
			this.addToggle(
				`${area.name} §7(${area.radius} blocks at ${Math.round(x)}, ${Math.round(z)})§r`,
				(v) => keep.set(area.id, v),
				{ defaultValue: true },
			);
		}
		this.show(context.getSourcePlayer(), sceneManager).then((r) => {
			if (r.canceled) return;
			const removed = areas.filter((a) => keep.get(a.id) === false);
			service.removeTeacherAreas(removed.map((a) => a.id));
			this.player.sendMessage(
				removed.length
					? `§aRemoved: ${removed.map((a) => a.name).join(", ")}`
					: "§7No changes made.",
			);
		});
	}
}
