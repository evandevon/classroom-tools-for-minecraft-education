import { Player, Vector3, world } from "@minecraft/server";
import { Module, ModuleManager } from "../../module-manager.ts";
import { ButtonConfig } from "../main/main.service.ts";
import { SceneContext } from "../scene_manager/scene-context.ts";
import { SceneManager } from "../scene_manager/scene-manager.ts";
import { StudentsService } from "../students/students.service.ts";
import { Selection, TimedEntries } from "../students/timed-entries.ts";
import { LockPlayerMechanic } from "./lock_player.mechanic.ts";
import { LockPlayerScene, LockPlayerSettingsScene } from "./lock_player.scene.ts";

export type LockCentre = "point" | "each" | "follow";

export interface LockData {
	radius: number;
	centre: LockCentre;
	showBoundary: boolean;
	point?: Vector3; // "point": the spot the teacher chose
	dimensionId?: string;
	followId?: string; // "follow": the teacher
}

type SavedCentres = Record<string, { center: Vector3; dimensionId: string }>;

/** Keeps individual students, or everybody, inside an area for a chosen time. */
export class LockPlayerService implements Module {
	static readonly id = "lock_player";
	public readonly id = LockPlayerService.id;
	private static readonly CENTRES_KEY = "lock_own_centres";
	private readonly entries = new TimedEntries<LockData>(world, "lock_state");
	private readonly mechanic = new LockPlayerMechanic(this);
	private ownCentres: SavedCentres = {};
	students!: StudentsService;

	constructor(private readonly moduleManager: ModuleManager) {}

	initialize(): void {
		this.students = this.moduleManager.getModule<StudentsService>(
			StudentsService.id,
		)!;
		const raw = world.getDynamicProperty(LockPlayerService.CENTRES_KEY);
		if (typeof raw === "string") {
			try {
				this.ownCentres = JSON.parse(raw);
			} catch (e) {
				console.warn(`Could not read saved lock centres: ${e}`);
			}
		}
		this.mechanic.initialize();
	}

	registerScenes(sceneManager: SceneManager): void {
		sceneManager.registerScene(
			LockPlayerScene.id,
			(manager: SceneManager, context: SceneContext) => {
				new LockPlayerScene(manager, context, this);
			},
		);
		sceneManager.registerScene(
			LockPlayerSettingsScene.id,
			(
				manager: SceneManager,
				context: SceneContext,
				selection: Selection,
			) => {
				new LockPlayerSettingsScene(manager, context, this, selection);
			},
		);
	}

	getMainButton(): ButtonConfig {
		return {
			labelKey: "edu_tools.ui.main.buttons.lock_player",
			iconPath: "textures/edu_tools/ui/main/lock_player",
			handler: (sceneManager: SceneManager, context: SceneContext) => {
				sceneManager.openSceneWithContext(context, LockPlayerScene.id, true);
			},
			weight: 20,
		};
	}

	getEntries(): TimedEntries<LockData> {
		return this.entries;
	}

	lock(selection: Selection, minutes: number | null, data: LockData): void {
		if (selection.everybody) this.ownCentres = {};
		else for (const p of selection.players) delete this.ownCentres[p.id];
		this.saveCentres();
		this.entries.apply(selection, minutes, data);
	}

	release(ids: string[]): void {
		this.entries.release(ids);
		this.forgetUnusedCentres();
	}

	releaseAll(): void {
		this.entries.releaseAll();
		this.ownCentres = {};
		this.saveCentres();
	}

	isLocked(playerId: string): boolean {
		return !this.students.isTeacher(playerId) &&
			!!this.entries.effective(playerId);
	}

	/** Where this student's area is right now. */
	getArea(
		player: Player,
		data: LockData,
	): { center: Vector3; dimensionId: string } | undefined {
		if (data.centre === "point" && data.point && data.dimensionId) {
			return { center: data.point, dimensionId: data.dimensionId };
		}
		if (data.centre === "follow") {
			const teacher = this.students.getTeacher();
			return teacher
				? { center: teacher.location, dimensionId: teacher.dimension.id }
				: undefined; // Teacher offline: the area can't follow anyone.
		}
		let own = this.ownCentres[player.id];
		if (!own) {
			own = { center: player.location, dimensionId: player.dimension.id };
			this.ownCentres[player.id] = own;
			this.saveCentres();
		}
		return own;
	}

	forgetUnusedCentres(): void {
		let changed = false;
		for (const id of Object.keys(this.ownCentres)) {
			if (this.entries.effective(id)?.data.centre !== "each") {
				delete this.ownCentres[id];
				changed = true;
			}
		}
		if (changed) this.saveCentres();
	}

	private saveCentres(): void {
		world.setDynamicProperty(
			LockPlayerService.CENTRES_KEY,
			JSON.stringify(this.ownCentres),
		);
	}
}
