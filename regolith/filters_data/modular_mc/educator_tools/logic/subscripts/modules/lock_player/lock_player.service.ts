import { BehaviourLogService } from "../behaviour_log/behaviour_log.service.ts";
import { Player, Vector3, world } from "@minecraft/server";
import { Module, ModuleManager } from "../../module-manager.ts";
import { ButtonConfig } from "../main/main.service.ts";
import { SceneContext } from "../scene_manager/scene-context.ts";
import { SceneManager } from "../scene_manager/scene-manager.ts";
import { StudentsService } from "../students/students.service.ts";
import {
	describeMinutes,
	Selection,
	TimedEntries,
} from "../students/timed-entries.ts";
import { HelpService } from "../help/help.service.ts";
import { LockPlayerMechanic } from "./lock_player.mechanic.ts";
import {
	LockPlayerScene,
	LockPlayerSettingsScene,
	openLockPicker,
} from "./lock_player.scene.ts";

export type LockCentre = "point" | "each" | "follow";

export interface LockData {
	radius: number;
	centre: LockCentre;
	showBoundary: boolean;
	point?: Vector3; // "point": the spot the teacher chose
	dimensionId?: string;
	followId?: string; // "follow": the teacher
}

export interface ActiveArea {
	center: Vector3;
	dimensionId: string;
	radius: number;
	showBoundary: boolean;
}

const HELPER_RANGE = 20;

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
				if (this.entries.isEmpty()) {
					openLockPicker(sceneManager, context, this);
				} else {
					sceneManager.openSceneWithContext(context, LockPlayerScene.id, true);
				}
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
		const note = `${describeMinutes(minutes)}, ${data.radius} blocks`;
		if (selection.everybody) this.log("Everybody", "Locked", note);
		else for (const p of selection.players) this.log(p.name, "Locked", note);
	}

	private log(who: string, what: string, note?: string): void {
		this.moduleManager.getModule<BehaviourLogService>(BehaviourLogService.id)
			?.add(who, what, note);
	}

	release(ids: string[], names: string[] = []): void {
		this.entries.release(ids);
		this.forgetUnusedCentres();
		for (const name of names) this.log(name, "Unlocked");
	}

	/** Records locks that ended because their time ran out. */
	logEnded(names: string[], everybody: boolean): void {
		for (const name of names) this.log(name, "Lock time ended");
		if (everybody) this.log("Everybody", "Lock time ended");
	}

	releaseAll(): void {
		if (!this.entries.isEmpty()) this.log("Everybody", "Unlocked");
		this.entries.releaseAll();
		this.ownCentres = {};
		this.saveCentres();
	}

	isLocked(playerId: string): boolean {
		return !this.students.isStaff(playerId) &&
			!!this.entries.effective(playerId);
	}

	/**
	 * The area a locked player must stay in right now. A locked helper shares
	 * the area of the student they're helping, then goes back to their own.
	 */
	getActiveArea(
		player: Player,
		data: LockData,
	): ActiveArea | undefined {
		const request = this.moduleManager.getModule<HelpService>(HelpService.id)
			?.getRequestBeingHelpedBy(player.id);
		if (request) {
			const studentLock = this.entries.effective(request.id);
			const student = world.getEntity(request.id) as Player | undefined;
			if (studentLock && student) {
				const area = this.getArea(student, studentLock.data);
				if (area) {
					return {
						...area,
						radius: studentLock.data.radius,
						showBoundary: studentLock.data.showBoundary,
					};
				}
			}
			// The student isn't locked, so stay close to their help flag.
			return {
				center: request.location,
				dimensionId: request.dimensionId,
				radius: HELPER_RANGE,
				showBoundary: false,
			};
		}
		const area = this.getArea(player, data);
		return area
			? { ...area, radius: data.radius, showBoundary: data.showBoundary }
			: undefined;
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
			// Follows whoever set the lock. If they're offline, it can't follow anyone.
			const leader = data.followId
				? world.getEntity(data.followId) as Player | undefined
				: undefined;
			return leader
				? { center: leader.location, dimensionId: leader.dimension.id }
				: undefined;
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
