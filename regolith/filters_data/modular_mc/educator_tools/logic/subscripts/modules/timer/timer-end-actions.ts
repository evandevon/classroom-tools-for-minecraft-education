import { GameMode, world } from "@minecraft/server";
import { ModuleManager } from "../../module-manager.ts";
import { BuildMarkerService } from "../build_marker/build_marker.service.ts";
import { FocusModeService } from "../focus_mode/focus_mode.service.ts";
import { GamemodeService } from "../gamemode/gamemode.service.ts";
import { LockPlayerService } from "../lock_player/lock_player.service.ts";
import { ShowcaseService } from "../showcase/showcase.service.ts";
import { StudentsService } from "../students/students.service.ts";
import { DURATIONS } from "../students/timed-entries.ts";
import { TeleportRequestsService } from "../teleport_requests/teleport_requests.service.ts";

export interface TimerEndChoice {
	action?: number; // Index into END_ACTIONS
	focusDuration?: number; // Index into DURATIONS, for Focus Mode
	message?: string;
}

const get = <T>(id: string) =>
	ModuleManager.getInstance().getModule(id) as unknown as T;
const focus = () => get<FocusModeService>(FocusModeService.id);
const students = () => get<StudentsService>(StudentsService.id);
const setMode = (mode: GameMode) => {
	get<GamemodeService>(GamemodeService.id).setGamemode(
		focus().classSelection(),
		mode,
	);
};

/** New actions go at the end, because saved timers remember the position. */
export const END_ACTIONS: {
	label: string;
	run: (choice: TimerEndChoice) => void;
}[] = [
	{ label: "Do nothing", run: () => {} },
	{
		label: "Focus Mode for everybody",
		run: (choice) => {
			focus().freeze(
				focus().classSelection(),
				DURATIONS[choice.focusDuration ?? 0].minutes,
				{ message: choice.message || "Time is up" },
			);
		},
	},
	{ label: "End Focus Mode", run: () => focus().releaseAll() },
	{
		label: "Start Showcase",
		run: () => get<ShowcaseService>(ShowcaseService.id).start(),
	},
	{
		label: "End Showcase",
		run: () => get<ShowcaseService>(ShowcaseService.id).end(),
	},
	{
		label: "Unlock Everybody",
		run: () => get<LockPlayerService>(LockPlayerService.id).releaseAll(),
	},
	{
		label: "Allow Teleport Requests",
		run: () =>
			get<TeleportRequestsService>(TeleportRequestsService.id).setActive(true),
	},
	{
		label: "Stop Teleport Requests",
		run: () =>
			get<TeleportRequestsService>(TeleportRequestsService.id).setActive(false),
	},
	{
		label: "Place a marker for anyone without one",
		run: () => {
			const markers = get<BuildMarkerService>(BuildMarkerService.id);
			const placed: string[] = [];
			for (const student of students().getOnlineStudents()) {
				if (markers.getMarker(student.id)) continue;
				markers.placeForPlayer(student);
				placed.push(student.name);
			}
			if (placed.length) {
				students().notifyTeacher(`§eMarkers placed for: ${placed.join(", ")}`);
			}
		},
	},
	{
		label: "Show a message",
		run: (choice) => {
			const message = choice.message || "Time is up";
			for (const player of world.getAllPlayers()) {
				player.onScreenDisplay.setTitle("§eTime is up", {
					stayDuration: 100,
					fadeInDuration: 5,
					fadeOutDuration: 15,
					subtitle: message,
				});
				player.sendMessage(`§e${message}`);
			}
		},
	},
	{
		label: "Set everybody to Adventure (no building)",
		run: () => setMode(GameMode.Adventure),
	},
	{
		label: "Set everybody to Creative",
		run: () => setMode(GameMode.Creative),
	},
];

export function runEndAction(choice: TimerEndChoice): void {
	try {
		END_ACTIONS[choice.action ?? 0]?.run(choice);
	} catch (e) {
		console.warn(`Timer end action failed: ${e}`);
		students().notifyTeacher("§cThe timer's end action didn't work.");
	}
}
