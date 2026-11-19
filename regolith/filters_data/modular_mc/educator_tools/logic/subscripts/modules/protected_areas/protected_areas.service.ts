import {
	EntityRideableComponent,
	EntityRidingComponent,
	Player,
	system,
	Vector3,
	world,
} from "@minecraft/server";
import { Module, ModuleManager } from "../../module-manager.ts";
import { BehaviourLogService } from "../behaviour_log/behaviour_log.service.ts";
import { BuildMarkerService } from "../build_marker/build_marker.service.ts";
import { FocusModeService } from "../focus_mode/focus_mode.service.ts";
import { HelpService } from "../help/help.service.ts";
import { ButtonConfig } from "../main/main.service.ts";
import { SceneContext } from "../scene_manager/scene-context.ts";
import { SceneManager } from "../scene_manager/scene-manager.ts";
import { ShowcaseService } from "../showcase/showcase.service.ts";
import { StudentsService } from "../students/students.service.ts";
import {
	describeMinutes,
	Selection,
	TimedEntries,
} from "../students/timed-entries.ts";
import {
	KeepOutSettingsScene,
	ProtectedAreasScene,
	TeacherAreaSettingsScene,
	TeacherAreasScene,
} from "./protected_areas.scene.ts";

export interface KeepOutData {
	radius: number;
	showEdges: boolean;
}

export interface TeacherArea {
	id: string;
	name: string;
	center: Vector3;
	dimensionId: string;
	radius: number;
	showEdges: boolean;
}

/** An area someone can't enter, as a column through all heights. */
interface Zone {
	center: Vector3;
	dimensionId: string;
	radius: number;
	kind: "build" | "teacher";
	ownerId?: string;
	showEdges: boolean;
}

const AREAS_KEY = "teacher_areas";
const VISIT_PASS_MINUTES = 10;
const PARTICLES = {
	build: "minecraft:villager_happy", // green
	teacher: "minecraft:blue_flame_particle", // blue
};

/**
 * Two kinds of protected area:
 * - Builds: students can be kept out of everybody else's build, while still
 *   free to go anywhere else. Each build is a circle around its marker.
 * - Teacher-only areas: nobody but teachers may enter.
 */
export class ProtectedAreasService implements Module {
	static readonly id = "protected_areas";
	public readonly id = ProtectedAreasService.id;
	private readonly entries = new TimedEntries<KeepOutData>(
		world,
		"keep_out_state",
	);
	private areas: TeacherArea[] = [];
	/** Visitor id → host id → when the pass ends. */
	private readonly passes = new Map<string, Map<string, number>>();
	private readonly lastAllowed = new Map<
		string,
		{ location: Vector3; dimensionId: string }
	>();
	private readonly returns = new Map<string, number[]>();
	private readonly lastAlert = new Map<string, number>();
	private tickCount = 0;

	constructor(private readonly moduleManager: ModuleManager) {}

	initialize(): void {
		const raw = world.getDynamicProperty(AREAS_KEY);
		if (typeof raw === "string") {
			try {
				this.areas = JSON.parse(raw);
			} catch (e) {
				console.warn(`Could not read teacher areas: ${e}`);
			}
		}
		system.runInterval(() => this.tick(), 2);
	}

	registerScenes(sceneManager: SceneManager): void {
		sceneManager.registerScene(
			ProtectedAreasScene.id,
			(manager: SceneManager, context: SceneContext) => {
				new ProtectedAreasScene(manager, context, this);
			},
		);
		sceneManager.registerScene(
			KeepOutSettingsScene.id,
			(manager: SceneManager, context: SceneContext, selection: Selection) => {
				new KeepOutSettingsScene(manager, context, this, selection);
			},
		);
		sceneManager.registerScene(
			TeacherAreaSettingsScene.id,
			(manager: SceneManager, context: SceneContext) => {
				new TeacherAreaSettingsScene(manager, context, this);
			},
		);
		sceneManager.registerScene(
			TeacherAreasScene.id,
			(manager: SceneManager, context: SceneContext) => {
				new TeacherAreasScene(manager, context, this);
			},
		);
	}

	getMainButton(): ButtonConfig {
		return {
			labelKey: "edu_tools.ui.main.buttons.protected_areas",
			iconPath: "textures/edu_tools/ui/main/lock_player",
			handler: (sceneManager: SceneManager, context: SceneContext) => {
				sceneManager.openSceneWithContext(context, ProtectedAreasScene.id, true);
			},
			weight: 21,
		};
	}

	get students(): StudentsService {
		return this.moduleManager.getModule<StudentsService>(StudentsService.id)!;
	}

	private markers(): BuildMarkerService | undefined {
		return this.moduleManager.getModule<BuildMarkerService>(
			BuildMarkerService.id,
		);
	}

	hasMarker(id: string): boolean {
		return !!this.markers()?.getMarker(id);
	}

	isEverybodyKeptOut(): boolean {
		return this.entries.effective("\u0000nobody") !== undefined;
	}

	getEntries(): TimedEntries<KeepOutData> {
		return this.entries;
	}

	// ---- Keeping students out of other builds ----

	keepOut(selection: Selection, minutes: number | null, data: KeepOutData): void {
		this.entries.apply(selection, minutes, data);
		const note = `${describeMinutes(minutes)}, ${data.radius} blocks`;
		if (selection.everybody) this.log("Everybody", "Kept out of other builds", note);
		else {
			for (const p of selection.players) {
				this.log(p.name, "Kept out of other builds", note);
			}
		}
	}

	letBackIn(ids: string[], names: string[]): void {
		this.entries.release(ids);
		for (const name of names) this.log(name, "Allowed back into builds");
	}

	letEverybodyBackIn(): void {
		this.entries.releaseAll();
		this.log("Everybody", "Allowed back into builds");
	}

	/** Lets a visitor into one student's build for a while. */
	allowVisit(visitorId: string, hostId: string): void {
		if (visitorId === hostId) return;
		let hosts = this.passes.get(visitorId);
		if (!hosts) this.passes.set(visitorId, (hosts = new Map()));
		hosts.set(hostId, Date.now() + VISIT_PASS_MINUTES * 60000);
	}

	clearVisits(): void {
		this.passes.clear();
	}

	// ---- Teacher-only areas ----

	getTeacherAreas(): TeacherArea[] {
		return [...this.areas];
	}

	addTeacherArea(player: Player, name: string, radius: number, showEdges: boolean): TeacherArea {
		const area: TeacherArea = {
			id: `${Date.now()}`,
			name: name.trim() || `Teacher area ${this.areas.length + 1}`,
			center: { ...player.location },
			dimensionId: player.dimension.id,
			radius,
			showEdges,
		};
		this.areas.push(area);
		this.saveAreas();
		return area;
	}

	removeTeacherAreas(ids: string[]): void {
		this.areas = this.areas.filter((a) => !ids.includes(a.id));
		this.saveAreas();
	}

	private saveAreas(): void {
		world.setDynamicProperty(AREAS_KEY, JSON.stringify(this.areas));
	}

	// ---- Enforcement ----

	private teacherZones(): Zone[] {
		return this.areas.map((a) => ({
			center: a.center,
			dimensionId: a.dimensionId,
			radius: a.radius,
			kind: "teacher",
			showEdges: a.showEdges,
		}));
	}

	private buildZones(data: KeepOutData): Zone[] {
		return (this.markers()?.getMarkers() ?? []).map(({ studentId, marker }) => ({
			center: marker.location,
			dimensionId: marker.dimensionId,
			radius: data.radius,
			kind: "build",
			ownerId: studentId,
			showEdges: data.showEdges,
		}));
	}

	private static flatDistance(a: Vector3, b: Vector3): number {
		return Math.hypot(a.x - b.x, a.z - b.z);
	}

	/** The zone this spot is forbidden by, if any. */
	private blockingZone(
		playerId: string,
		location: Vector3,
		dimensionId: string,
		teacherZones: Zone[],
		buildZones: Zone[],
	): Zone | undefined {
		const d = ProtectedAreasService.flatDistance;
		for (const zone of teacherZones) {
			if (zone.dimensionId === dimensionId && d(location, zone.center) <= zone.radius) {
				return zone;
			}
		}
		if (buildZones.length === 0) return undefined;
		const own = buildZones.find((z) => z.ownerId === playerId);
		const ownDistance = own && own.dimensionId === dimensionId
			? d(location, own.center)
			: Infinity;
		const passes = this.passes.get(playerId);
		const helping = this.moduleManager.getModule<HelpService>(HelpService.id)
			?.getRequestBeingHelpedBy(playerId)?.id;
		const now = Date.now();
		for (const zone of buildZones) {
			if (zone.ownerId === playerId || zone.dimensionId !== dimensionId) continue;
			const distance = d(location, zone.center);
			if (distance > zone.radius) continue;
			// Where two builds overlap, the ground is split down the middle.
			if (ownDistance <= distance) continue;
			if (zone.ownerId === helping) continue;
			const pass = passes?.get(zone.ownerId!);
			if (pass !== undefined && pass > now) continue;
			return zone;
		}
		return undefined;
	}

	private tick(): void {
		this.tickCount++;
		if (this.tickCount % 30 === 0) this.housekeeping();
		const teacherZones = this.teacherZones();
		const anyKeptOut = !this.entries.isEmpty();
		if (teacherZones.length === 0 && !anyKeptOut) return;
		const showcase = this.moduleManager.getModule<ShowcaseService>(
			ShowcaseService.id,
		)?.isActive();
		const focus = this.moduleManager.getModule<FocusModeService>(
			FocusModeService.id,
		);
		const zonesFor = new Map<KeepOutData, Zone[]>();

		for (const player of world.getAllPlayers()) {
			try {
				if (this.students.isStaff(player.id)) continue;
				if (focus?.isFrozen(player.id)) continue;
				const entry = anyKeptOut && !showcase
					? this.entries.effective(player.id)
					: undefined;
				let buildZones: Zone[] = [];
				if (entry) {
					buildZones = zonesFor.get(entry.data) ??
						this.buildZones(entry.data);
					zonesFor.set(entry.data, buildZones);
				}
				const dimensionId = player.dimension.id;
				const zone = this.blockingZone(
					player.id,
					player.location,
					dimensionId,
					teacherZones,
					buildZones,
				);
				if (zone) {
					this.sendOut(player, zone, teacherZones, buildZones);
				} else {
					this.lastAllowed.set(player.id, {
						location: { ...player.location },
						dimensionId,
					});
					if (this.tickCount % 5 === 0) {
						this.showNearbyEdges(player, [...teacherZones, ...buildZones]);
					}
				}
			} catch (e) {
				console.warn(`Protected areas failed for ${player.name}: ${e}`);
			}
		}
	}

	private housekeeping(): void {
		const ended = this.entries.sweep();
		for (const name of ended.names) this.log(name, "Keep-out time ended");
		if (ended.everybody) {
			this.log("Everybody", "Keep-out time ended");
			this.students.notifyTeacher("§eStudents can enter each other's builds again.");
		}
		if (ended.names.length) {
			this.students.notifyTeacher(
				`§eThese students can enter other builds again: ${ended.names.join(", ")}`,
			);
		}
		const now = Date.now();
		for (const [visitor, hosts] of this.passes) {
			for (const [host, until] of hosts) if (until <= now) hosts.delete(host);
			if (hosts.size === 0) this.passes.delete(visitor);
		}
	}

	private sendOut(
		player: Player,
		zone: Zone,
		teacherZones: Zone[],
		buildZones: Zone[],
	): void {
		const now = system.currentTick;
		const recent = (this.returns.get(player.id) ?? []).filter(
			(t) => now - t < 60 * 20,
		);
		recent.push(now);
		this.returns.set(player.id, recent);
		const quickRepeats = recent.filter((t) => now - t < 40).length;
		const allowed = (location: Vector3, dimensionId: string) =>
			!this.blockingZone(player.id, location, dimensionId, teacherZones, buildZones);

		let target: { location: Vector3; dimensionId: string } | undefined;
		const last = this.lastAllowed.get(player.id);
		if (last && quickRepeats <= 5 && allowed(last.location, last.dimensionId)) {
			target = last;
		}
		if (!target) target = this.spotOutside(player, zone, allowed);
		if (!target) {
			const own = this.markers()?.getMarker(player.id);
			if (own && allowed(own.location, own.dimensionId)) {
				target = { location: own.location, dimensionId: own.dimensionId };
			}
		}
		if (!target) {
			const spawn = world.getDefaultSpawnLocation();
			const overworld = "minecraft:overworld";
			if (spawn.y < 32000 && allowed(spawn, overworld)) {
				target = { location: spawn, dimensionId: overworld };
			}
		}
		if (!target) return;

		this.dismount(player);
		player.teleport(target.location, {
			dimension: world.getDimension(target.dimensionId),
			rotation: player.getRotation(),
		});
		player.onScreenDisplay.setActionBar(
			zone.kind === "teacher"
				? "§9This area is for teachers only."
				: "§aThat's someone else's build. Ask to visit first.",
		);
		this.maybeAlert(player, zone, recent.length, now);
	}

	/** A safe spot just outside the edge, on the side the player came from. */
	private spotOutside(
		player: Player,
		zone: Zone,
		allowed: (l: Vector3, d: string) => boolean,
	): { location: Vector3; dimensionId: string } | undefined {
		let dx = player.location.x - zone.center.x;
		let dz = player.location.z - zone.center.z;
		const length = Math.hypot(dx, dz);
		if (length < 0.01) {
			dx = 1;
			dz = 0;
		} else {
			dx /= length;
			dz /= length;
		}
		const dimension = world.getDimension(zone.dimensionId);
		for (const extra of [2, 6, 12]) {
			const x = zone.center.x + dx * (zone.radius + extra);
			const z = zone.center.z + dz * (zone.radius + extra);
			let y = player.location.y;
			try {
				const top = dimension.getTopmostBlock({ x, z });
				if (top) y = top.location.y + 1;
			} catch {
				// Unloaded ground: keep their current height.
			}
			const location = { x, y, z };
			if (allowed(location, zone.dimensionId)) {
				return { location, dimensionId: zone.dimensionId };
			}
		}
		return undefined;
	}

	private dismount(player: Player): void {
		try {
			const riding = player.getComponent("minecraft:riding") as
				| EntityRidingComponent
				| undefined;
			const vehicle = riding?.entityRidingOn;
			if (!vehicle) return;
			(vehicle.getComponent("minecraft:rideable") as
				| EntityRideableComponent
				| undefined)?.ejectRider(player);
		} catch (e) {
			console.warn(`Could not dismount ${player.name}: ${e}`);
		}
	}

	private maybeAlert(player: Player, zone: Zone, count: number, now: number): void {
		if (count < 5) return;
		const last = this.lastAlert.get(player.id);
		if (last !== undefined && now - last < 120 * 20) return;
		this.lastAlert.set(player.id, now);
		const where = zone.kind === "teacher"
			? "a teacher-only area"
			: "other students' builds";
		this.students.notifyTeacher(`§e${player.name} keeps trying to enter ${where}.`);
		this.log(
			player.name,
			zone.kind === "teacher"
				? "Kept trying to enter a teacher-only area"
				: "Kept trying to enter other builds",
		);
	}

	/** Draws the part of each nearby edge close to the player. */
	private showNearbyEdges(player: Player, zones: Zone[]): void {
		const d = ProtectedAreasService.flatDistance;
		for (const zone of zones) {
			if (!zone.showEdges || zone.dimensionId !== player.dimension.id) continue;
			const fromEdge = d(player.location, zone.center) - zone.radius;
			if (fromEdge < 0 || fromEdge > 6) continue;
			const angle = Math.atan2(
				player.location.z - zone.center.z,
				player.location.x - zone.center.x,
			);
			const span = Math.min(Math.PI, 8 / zone.radius);
			const steps = Math.max(4, Math.ceil(span * zone.radius));
			for (let i = 0; i <= steps; i++) {
				const a = angle - span + (2 * span * i) / steps;
				for (const dy of [0.2, 1.4]) {
					try {
						player.dimension.spawnParticle(PARTICLES[zone.kind], {
							x: zone.center.x + Math.cos(a) * zone.radius,
							y: player.location.y + dy,
							z: zone.center.z + Math.sin(a) * zone.radius,
						});
					} catch {
						// Particles outside loaded chunks fail quietly.
					}
				}
			}
		}
	}

	private log(who: string, what: string, note?: string): void {
		this.moduleManager.getModule<BehaviourLogService>(BehaviourLogService.id)
			?.add(who, what, note);
	}
}
