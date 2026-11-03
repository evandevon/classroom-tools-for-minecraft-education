import { system, world } from "@minecraft/server";
import { FocusModeService } from "./focus_mode.service.ts";

export class FocusModeMechanic {
	constructor(private readonly service: FocusModeService) {}

	initialize(): void {
		system.runInterval(() => this.tick(), 20);
		world.afterEvents.playerLeave.subscribe((event) => {
			this.service.forgetSession(event.playerId);
		});
	}

	tick(): void {
		const ended = this.service.getEntries().sweep();
		this.service.logEnded(ended.names, ended.everybody);
		if (ended.everybody) {
			this.service.students.notifyTeacher("§eFocus Mode time is up for everybody.");
		}
		if (ended.names.length) {
			this.service.students.notifyTeacher(
				`§eFocus Mode time is up: ${ended.names.join(", ")}`,
			);
		}
		for (const player of world.getAllPlayers()) {
			// One student's error must never stop the others being handled.
			try {
				const entry = this.service.students.isTeacher(player.id)
					? undefined
					: this.service.getEntries().effective(player.id);
				if (entry) {
					this.service.applyFreeze(player, entry);
				} else if (this.service.wasFrozen(player)) {
					this.service.removeFreeze(player);
				}
			} catch (e) {
				console.warn(`Focus Mode failed for ${player.name}: ${e}`);
			}
		}
	}
}
