import { BehaviourLogService } from "../behaviour_log/behaviour_log.service.ts";
import { Player, system, world } from "@minecraft/server";
import { Module, ModuleManager } from "../../module-manager.ts";
import { ButtonConfig } from "../main/main.service.ts";
import { SceneContext } from "../scene_manager/scene-context.ts";
import { SceneManager } from "../scene_manager/scene-manager.ts";
import { ModalUIScene } from "../scene_manager/ui-scene.ts";
import { StudentsService } from "../students/students.service.ts";
import { describeSelection, Selection } from "../students/timed-entries.ts";

const EFFECT_SECONDS = 5;
const DEFAULT_MESSAGE = "Please follow the class rules";

/**
 * A visible reminder before any consequence. Counts reset when the world is
 * reopened, so each lesson starts fresh.
 */
export class WarningService implements Module {
	static readonly id = "warning";
	public readonly id = WarningService.id;
	private readonly counts = new Map<string, number>();
	private readonly effects = new Map<string, number>(); // id -> ms it ends

	constructor(private readonly moduleManager: ModuleManager) {}

	initialize(): void {
		system.runInterval(() => this.showParticles(), 10);
	}

	registerScenes(sceneManager: SceneManager): void {
		sceneManager.registerScene(
			WarningSettingsScene.id,
			(manager: SceneManager, context: SceneContext, selection: Selection) => {
				new WarningSettingsScene(manager, context, this, selection);
			},
		);
	}

	getMainButton(): ButtonConfig {
		return {
			labelKey: "edu_tools.ui.main.buttons.warning",
			iconPath: "textures/edu_tools/ui/main/warning",
			handler: (sceneManager: SceneManager, context: SceneContext) => {
				const students = this.students().getOnlineStudents();
				if (students.length === 0) {
					sceneManager.openSceneWithContext(context, "not_enough_players", true);
					return;
				}
				sceneManager.openSceneWithContext(context, "player_select", true, {
					everybodyLabel: "§lEverybody§r",
					players: students.map((s) => {
						const count = this.counts.get(s.id) ?? 0;
						return {
							id: s.id,
							name: s.name,
							status: count
								? `${count} warning${count === 1 ? "" : "s"}`
								: undefined,
						};
					}),
					onSelected: (selection: Selection) => {
						sceneManager.openSceneWithContext(
							context,
							WarningSettingsScene.id,
							true,
							selection,
						);
					},
				});
			},
			weight: 7,
		};
	}

	private students(): StudentsService {
		return this.moduleManager.getModule<StudentsService>(StudentsService.id)!;
	}

	/** Returns a summary of who was warned, with their counts. */
	warn(selection: Selection, message: string): string {
		const summary: string[] = [];
		for (const { id, name } of selection.players) {
			const player = world.getEntity(id) as Player | undefined;
			if (!player) continue;
			const count = (this.counts.get(id) ?? 0) + 1;
			this.counts.set(id, count);
			summary.push(`${name} (${count})`);
			this.moduleManager.getModule<BehaviourLogService>(BehaviourLogService.id)
				?.add(name, `Warning ${count}`, message);
			try {
				this.effects.set(id, Date.now() + EFFECT_SECONDS * 1000);
				player.camera.fade({
					fadeColor: { red: 0.8, green: 0, blue: 0 },
					fadeTime: { fadeInTime: 0.2, holdTime: 0.3, fadeOutTime: 0.8 },
				});
				player.onScreenDisplay.setTitle(`§c§lWarning ${count}`, {
					stayDuration: 80,
					fadeInDuration: 5,
					fadeOutDuration: 15,
					subtitle: message,
				});
				player.playSound("note.bass");
			} catch (e) {
				console.warn(`Could not warn ${name}: ${e}`);
			}
		}
		return summary.join(", ");
	}

	private showParticles(): void {
		const now = Date.now();
		for (const [id, until] of this.effects) {
			if (until <= now) {
				this.effects.delete(id);
				continue;
			}
			const player = world.getEntity(id) as Player | undefined;
			if (!player) continue;
			try {
				const { x, y, z } = player.location;
				player.dimension.spawnParticle("minecraft:villager_angry", {
					x,
					y: y + 2.2,
					z,
				});
			} catch (e) {
				console.warn(`Could not show warning effect: ${e}`);
			}
		}
	}
}

class WarningSettingsScene extends ModalUIScene {
	static readonly id = "warning_settings";

	constructor(
		sceneManager: SceneManager,
		context: SceneContext,
		service: WarningService,
		selection: Selection,
	) {
		super(WarningSettingsScene.id, context.getSourcePlayer());
		this.setContext(context);
		let message = DEFAULT_MESSAGE;
		this.addTextField(
			`Message for ${describeSelection(selection)}`,
			"No message",
			(value: string) => {
				message = value.trim();
			},
			{ defaultValue: DEFAULT_MESSAGE },
		);
		this.show(context.getSourcePlayer(), sceneManager).then((r) => {
			if (r.canceled) return;
			const summary = service.warn(selection, message);
			this.player.sendMessage(`§eWarned: ${summary || "nobody online"}`);
		});
	}
}
