import { Player, system, world } from "@minecraft/server";
import { ModuleManager } from "../../module-manager.ts";
import { StudentsService } from "../students/students.service.ts";
import { TimerService } from "./timer.service.ts";
import { SceneManager } from "../scene_manager/scene-manager.ts";

export class TimerMechanic {
	static readonly id = "timer";

	private taskId: number | null = null;

	constructor(private readonly timerService: TimerService) {}

	initialize(): void {
		this.taskId = system.runInterval(() => {
			this.tick();
		}, 20);
		world.afterEvents.playerInteractWithEntity.subscribe((event) => {
			if (event.target.typeId === "edu_tools:timer") {
				this.onTimerClicked(event.player);
			}
		});
	}

	tick(): void {
		// First account for any inactivity (game closed) time so countdown remains fair
		this.timerService.handleInactivity();
		this.timerService.updateTimerEntity();
	}

	onTimerClicked(player: Player): void {
		// Students can see the timer, but only the teacher can change it.
		const students = ModuleManager.getInstance().getModule<StudentsService>(
			StudentsService.id,
		);
		if (!students?.isTeacher(player.id)) return;
		const sceneManager = SceneManager.getInstance();
		sceneManager.createContextAndOpenScene(player, "timer");
	}

	stop(): void {
		if (this.taskId !== null) {
			system.clearRun(this.taskId);
			this.taskId = null;
		}
	}
}
