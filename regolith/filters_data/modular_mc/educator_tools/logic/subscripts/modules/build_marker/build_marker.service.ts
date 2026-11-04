import {
	EntityInventoryComponent,
	ItemLockMode,
	ItemStack,
	Player,
	system,
	Vector3,
	world,
} from "@minecraft/server";
import { Module, ModuleManager } from "../../module-manager.ts";
import { FocusModeService } from "../focus_mode/focus_mode.service.ts";
import { ButtonConfig } from "../main/main.service.ts";
import { SceneContext } from "../scene_manager/scene-context.ts";
import { SceneManager } from "../scene_manager/scene-manager.ts";
import { ShowcaseService } from "../showcase/showcase.service.ts";
import { TeleportRequestsService } from "../teleport_requests/teleport_requests.service.ts";
import { StudentsService } from "../students/students.service.ts";
import { Selection } from "../students/timed-entries.ts";
import { BuildMarkerScene, BuildMarkersScene } from "./build_marker.scene.ts";

export interface BuildMarker {
	name: string;
	location: Vector3;
	dimensionId: string;
	stamp: string; // Identifies the current marker entity for this student
}

export function markerLabel(marker: BuildMarker): string {
	return `${marker.name}'s build`;
}

const ITEM_ID = "edu_tools:build_marker";
const ENTITY_ID = "edu_tools:build_marker";
const STAMP_PROPERTY = "marker_stamp";
const DIMENSIONS = ["overworld", "nether", "the_end"];

/** Everyone can place one marker; the teacher can go there or send students. */
export class BuildMarkerService implements Module {
	static readonly id = "build_marker";
	public readonly id = BuildMarkerService.id;
	private static readonly KEY = "build_markers";
	private markers: Record<string, BuildMarker> = {};
	students!: StudentsService;

	constructor(private readonly moduleManager: ModuleManager) {}

	initialize(): void {
		this.students = this.moduleManager.getModule<StudentsService>(
			StudentsService.id,
		)!;
		const raw = world.getDynamicProperty(BuildMarkerService.KEY);
		if (typeof raw === "string") {
			try {
				this.markers = JSON.parse(raw);
			} catch (e) {
				console.warn(`Could not read saved markers: ${e}`);
			}
		}
		world.afterEvents.playerSpawn.subscribe((event) => {
			system.runTimeout(() => this.giveItem(event.player), 1);
		});
		world.afterEvents.itemUse.subscribe((event) => {
			if (event.itemStack.typeId === ITEM_ID) this.onUse(event.source);
		});
		// A marker in an unloaded area can't be removed until that area loads.
		system.runInterval(() => this.removeOldEntities(), 100);
	}

	registerScenes(sceneManager: SceneManager): void {
		sceneManager.registerScene(
			BuildMarkersScene.id,
			(manager: SceneManager, context: SceneContext) => {
				new BuildMarkersScene(manager, context, this);
			},
		);
		sceneManager.registerScene(
			BuildMarkerScene.id,
			(manager: SceneManager, context: SceneContext, studentId: string) => {
				new BuildMarkerScene(manager, context, this, studentId);
			},
		);
	}

	getMainButton(): ButtonConfig {
		return {
			labelKey: "edu_tools.ui.main.buttons.build_markers",
			iconPath: "textures/edu_tools/ui/main/build_markers",
			handler: (sceneManager: SceneManager, context: SceneContext) => {
				sceneManager.openSceneWithContext(context, BuildMarkersScene.id, true);
			},
			weight: 45,
		};
	}

	/** Markers, A to Z by student name. */
	getMarkers(): { studentId: string; marker: BuildMarker }[] {
		return Object.entries(this.markers)
			.map(([studentId, marker]) => ({ studentId, marker }))
			.sort((a, b) => a.marker.name.localeCompare(b.marker.name));
	}

	getMarker(studentId: string): BuildMarker | undefined {
		return this.markers[studentId];
	}

	private giveItem(player: Player): void {
		try {
			const inventory = (player.getComponent(
				"inventory",
			) as EntityInventoryComponent).container;
			if (!inventory) return;
			for (let i = 0; i < inventory.size; i++) {
				if (inventory.getItem(i)?.typeId === ITEM_ID) return;
			}
			const item = new ItemStack(ITEM_ID, 1);
			item.lockMode = ItemLockMode.inventory;
			inventory.addItem(item);
		} catch (e) {
			console.warn(`Could not give marker to ${player.name}: ${e}`);
		}
	}

	private onUse(player: Player): void {
		const focus = this.moduleManager.getModule<FocusModeService>(
			FocusModeService.id,
		);
		if (focus?.isFrozen(player.id)) return;
		const showcase = this.moduleManager.getModule<ShowcaseService>(
			ShowcaseService.id,
		);
		if (showcase?.isActive()) {
			SceneManager.getInstance().createContextAndOpenScene(
				player,
				"showcase_builds",
			);
			return;
		}
		const requests = this.moduleManager.getModule<TeleportRequestsService>(
			TeleportRequestsService.id,
		);
		if (requests?.isActive() && !this.students.isTeacher(player.id)) {
			SceneManager.getInstance().createContextAndOpenScene(player, "marker_menu");
			return;
		}
		this.placeForPlayer(player);
	}

	placeForPlayer(player: Player): void {
		const moved = !!this.markers[player.id];
		this.place(player);
		player.sendMessage(
			moved
				? "§aYour marker has moved here."
				: "§aYour marker is here. Use the item again to move it.",
		);
		player.playSound("random.orb");
	}

	private place(player: Player): void {
		const stamp = `${player.id}:${Date.now()}`;
		const location = { ...player.location };
		this.markers[player.id] = {
			name: player.name,
			location,
			dimensionId: player.dimension.id,
			stamp,
		};
		this.save();
		try {
			const entity = player.dimension.spawnEntity(ENTITY_ID, location);
			entity.setDynamicProperty(STAMP_PROPERTY, stamp);
			entity.nameTag = markerLabel(this.markers[player.id]);
		} catch (e) {
			console.warn(`Could not show marker for ${player.name}: ${e}`);
		}
		this.removeOldEntities();
	}

	remove(studentId: string): void {
		delete this.markers[studentId];
		this.save();
		this.removeOldEntities();
	}

	removeAll(): void {
		this.markers = {};
		this.save();
		this.removeOldEntities();
	}

	teleportSelection(selection: Selection, marker: BuildMarker): void {
		for (const { id } of selection.players) {
			(world.getEntity(id) as Player | undefined)?.teleport(marker.location, {
				dimension: world.getDimension(marker.dimensionId),
			});
		}
	}

	private removeOldEntities(): void {
		const current = new Set(Object.values(this.markers).map((m) => m.stamp));
		for (const id of DIMENSIONS) {
			try {
				for (const entity of world.getDimension(id).getEntities({
					type: ENTITY_ID,
				})) {
					if (!current.has(String(entity.getDynamicProperty(STAMP_PROPERTY)))) {
						entity.remove();
					}
				}
			} catch (e) {
				console.warn(`Could not tidy markers in ${id}: ${e}`);
			}
		}
	}

	private save(): void {
		world.setDynamicProperty(
			BuildMarkerService.KEY,
			JSON.stringify(this.markers),
		);
	}
}
