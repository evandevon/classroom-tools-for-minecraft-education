import { GameMode, Player, system, world } from "@minecraft/server";
import { Module, ModuleManager } from "../../module-manager.ts";
import { BuildMarkerService } from "../build_marker/build_marker.service.ts";
import { markerLabel } from "../build_marker/build_marker.service.ts";
import { FocusModeService } from "../focus_mode/focus_mode.service.ts";
import { ButtonConfig } from "../main/main.service.ts";
import { SceneContext } from "../scene_manager/scene-context.ts";
import { SceneManager } from "../scene_manager/scene-manager.ts";
import { ActionUIScene } from "../scene_manager/ui-scene.ts";
import { StudentsService } from "../students/students.service.ts";

const ACTIVE_KEY = "showcase_active";
const RULES_KEY = "showcase_rules";
const SAVED_MODE = "showcase_gamemode";
const RULES = ["pvp", "fallDamage", "tntExplodes"] as const;

/**
 * While on, students can look but not build, and their Build Marker opens a
 * list of builds to visit. Everything goes back to how it was when it ends.
 */
export class ShowcaseService implements Module {
	static readonly id = "showcase";
	public readonly id = ShowcaseService.id;
	students!: StudentsService;

	constructor(private readonly moduleManager: ModuleManager) {}

	initialize(): void {
		this.students = this.moduleManager.getModule<StudentsService>(
			StudentsService.id,
		)!;
		system.runInterval(() => this.tick(), 20);
	}

	registerScenes(sceneManager: SceneManager): void {
		sceneManager.registerScene(
			ShowcaseBuildsScene.id,
			(manager: SceneManager, context: SceneContext) => {
				new ShowcaseBuildsScene(manager, context, this);
			},
		);
	}

	getExtraMainButtons(): [string, ButtonConfig][] {
		return [
			[
				"start_showcase",
				{
					labelKey: "edu_tools.ui.main.buttons.start_showcase",
					iconPath: "textures/edu_tools/ui/main/build_markers",
					handler: (_: SceneManager, context: SceneContext) => {
						this.start();
						context.getSourcePlayer().sendMessage("§aShowcase has started.");
					},
					weight: 46,
					visible: () => !this.isActive(),
				},
			],
			[
				"end_showcase",
				{
					labelKey: "edu_tools.ui.main.buttons.end_showcase",
					iconPath: "textures/edu_tools/ui/main/build_markers",
					handler: (_: SceneManager, context: SceneContext) => {
						this.end();
						context.getSourcePlayer().sendMessage("§aShowcase has ended.");
					},
					weight: 3,
					visible: () => this.isActive(),
				},
			],
		];
	}

	isActive(): boolean {
		return world.getDynamicProperty(ACTIVE_KEY) === true;
	}

	markers(): BuildMarkerService {
		return this.moduleManager.getModule<BuildMarkerService>(
			BuildMarkerService.id,
		)!;
	}

	start(): void {
		if (this.isActive()) return;
		const saved: Record<string, boolean> = {};
		for (const rule of RULES) {
			saved[rule] = world.gameRules[rule];
			world.gameRules[rule] = false;
		}
		world.setDynamicProperty(RULES_KEY, JSON.stringify(saved));
		world.setDynamicProperty(ACTIVE_KEY, true);
		this.tick();
		for (const student of this.students.getOnlineStudents()) {
			this.announce(
				student,
				"§aShowcase!",
				"Use your Build Marker to visit builds",
			);
		}
	}

	end(): void {
		if (!this.isActive()) return;
		const raw = world.getDynamicProperty(RULES_KEY);
		if (typeof raw === "string") {
			const saved = JSON.parse(raw) as Record<string, boolean>;
			for (const rule of RULES) {
				if (typeof saved[rule] === "boolean") {
					world.gameRules[rule] = saved[rule];
				}
			}
		}
		world.setDynamicProperty(RULES_KEY, undefined);
		world.setDynamicProperty(ACTIVE_KEY, false);
		this.tick();
		for (const student of this.students.getOnlineStudents()) {
			this.announce(student, "§aShowcase finished", "Back to building");
		}
	}

	private announce(player: Player, title: string, subtitle: string): void {
		try {
			player.onScreenDisplay.setTitle(title, {
				stayDuration: 60,
				fadeInDuration: 5,
				fadeOutDuration: 15,
				subtitle,
			});
		} catch (e) {
			console.warn(`Could not show showcase title: ${e}`);
		}
	}

	/** Also catches students who join, return, or leave Focus Mode part way. */
	private tick(): void {
		const active = this.isActive();
		// Someone made a trusted player during a showcase gets their mode back.
		for (const player of world.getAllPlayers()) {
			const saved = player.getDynamicProperty(SAVED_MODE);
			if (this.students.isStaff(player.id) && typeof saved === "string") {
				player.setGameMode(saved as GameMode);
				player.setDynamicProperty(SAVED_MODE, undefined);
			}
		}
		const focus = this.moduleManager.getModule<FocusModeService>(
			FocusModeService.id,
		);
		for (const student of this.students.getOnlineStudents()) {
			if (focus?.isFrozen(student.id)) continue;
			try {
				const saved = student.getDynamicProperty(SAVED_MODE);
				if (active) {
					if (typeof saved !== "string") {
						student.setDynamicProperty(SAVED_MODE, student.getGameMode());
					}
					if (student.getGameMode() !== GameMode.Adventure) {
						student.setGameMode(GameMode.Adventure);
					}
				} else if (typeof saved === "string") {
					student.setGameMode(saved as GameMode);
					student.setDynamicProperty(SAVED_MODE, undefined);
				}
			} catch (e) {
				console.warn(`Showcase failed for ${student.name}: ${e}`);
			}
		}
	}
}

class ShowcaseBuildsScene extends ActionUIScene {
	static readonly id = "showcase_builds";

	constructor(
		sceneManager: SceneManager,
		context: SceneContext,
		service: ShowcaseService,
	) {
		super(ShowcaseBuildsScene.id, context.getSourcePlayer());
		this.setContext(context);
		const markers = service.markers().getMarkers();
		this.setSimpleBody(
			markers.length
				? "edu_tools.ui.showcase_builds.body"
				: "edu_tools.ui.showcase_builds.empty",
		);
		for (const { marker } of markers) {
			this.addButton(
				markerLabel(marker),
				() => {
					service.markers().teleportSelection(
						{ everybody: false, players: [{ id: this.player.id, name: "" }] },
						marker,
					);
				},
				"textures/edu_tools/ui/main/build_markers",
			);
		}
		this.show(context.getSourcePlayer(), sceneManager);
	}
}
