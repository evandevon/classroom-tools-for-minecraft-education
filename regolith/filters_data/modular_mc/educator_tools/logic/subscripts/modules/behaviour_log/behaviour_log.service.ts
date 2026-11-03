import { world } from "@minecraft/server";
import { Module } from "../../module-manager.ts";
import { ButtonConfig } from "../main/main.service.ts";
import { SceneContext } from "../scene_manager/scene-context.ts";
import { SceneManager } from "../scene_manager/scene-manager.ts";
import { ActionUIScene, ModalUIScene } from "../scene_manager/ui-scene.ts";

export interface LogEntry {
	t: number; // When it happened (ms)
	who: string;
	what: string;
	note?: string;
}

const MAX_ENTRIES = 200;
const MAX_NOTE = 60;
const PAGE_SIZE = 25;

function pad(n: number): string {
	return n < 10 ? `0${n}` : `${n}`;
}

export function formatEntry(entry: LogEntry): string {
	const d = new Date(entry.t);
	const when = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${
		pad(d.getHours())
	}:${pad(d.getMinutes())}`;
	return [when, entry.who, entry.what, entry.note].filter(Boolean).join(", ");
}

/** Records warnings, Focus Mode and locks. Saved with the world until cleared. */
export class BehaviourLogService implements Module {
	static readonly id = "behaviour_log";
	public readonly id = BehaviourLogService.id;
	private static readonly KEY = "behaviour_log";
	private entries: LogEntry[] = [];

	initialize(): void {
		const raw = world.getDynamicProperty(BehaviourLogService.KEY);
		if (typeof raw === "string") {
			try {
				this.entries = JSON.parse(raw);
			} catch (e) {
				console.warn(`Could not read the behaviour log: ${e}`);
			}
		}
	}

	registerScenes(sceneManager: SceneManager): void {
		sceneManager.registerScene(
			BehaviourLogScene.id,
			(manager: SceneManager, context: SceneContext) => {
				new BehaviourLogScene(manager, context, this);
			},
		);
		sceneManager.registerScene(
			CopyLogScene.id,
			(manager: SceneManager, context: SceneContext, page = 0) => {
				new CopyLogScene(manager, context, this, page);
			},
		);
		sceneManager.registerScene(
			ClearLogScene.id,
			(manager: SceneManager, context: SceneContext) => {
				new ClearLogScene(manager, context, this);
			},
		);
	}

	getMainButton(): ButtonConfig {
		return {
			labelKey: "edu_tools.ui.main.buttons.behaviour_log",
			iconPath: "textures/edu_tools/ui/main/behaviour_log",
			handler: (sceneManager: SceneManager, context: SceneContext) => {
				sceneManager.openSceneWithContext(context, BehaviourLogScene.id, true);
			},
			weight: 75,
		};
	}

	add(who: string, what: string, note?: string): void {
		const trimmed = note?.trim().slice(0, MAX_NOTE);
		this.entries.push({
			t: Date.now(),
			who,
			what,
			...(trimmed ? { note: trimmed } : {}),
		});
		if (this.entries.length > MAX_ENTRIES) {
			this.entries.splice(0, this.entries.length - MAX_ENTRIES);
		}
		this.save();
	}

	getEntries(): LogEntry[] {
		return this.entries;
	}

	clear(): void {
		this.entries = [];
		this.save();
	}

	private save(): void {
		world.setDynamicProperty(
			BehaviourLogService.KEY,
			JSON.stringify(this.entries),
		);
	}
}

class BehaviourLogScene extends ActionUIScene {
	static readonly id = "behaviour_log";

	constructor(
		sceneManager: SceneManager,
		context: SceneContext,
		service: BehaviourLogService,
	) {
		super(BehaviourLogScene.id, context.getSourcePlayer());
		this.setContext(context);
		const entries = service.getEntries();
		const recent = entries.slice(-20).reverse().map(formatEntry);
		this.setRawBody([{
			text: entries.length
				? `Newest first (showing ${recent.length} of ${entries.length}):\n\n${
					recent.join("\n")
				}`
				: "Nothing has been recorded.",
		}]);
		if (entries.length) {
			this.addButton("edu_tools.ui.behaviour_log.copy", () => {
				sceneManager.openSceneWithContext(context, CopyLogScene.id, true, 0);
			});
			this.addButton(
				"edu_tools.ui.behaviour_log.clear",
				() => {
					sceneManager.openSceneWithContext(context, ClearLogScene.id, true);
				},
				"textures/edu_tools/ui/lock_player/delete_lock",
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

/** One page at a time, oldest first, because a text box may limit its length. */
class CopyLogScene extends ModalUIScene {
	static readonly id = "copy_log";

	constructor(
		sceneManager: SceneManager,
		context: SceneContext,
		service: BehaviourLogService,
		page: number,
	) {
		super(CopyLogScene.id, context.getSourcePlayer());
		this.setContext(context);
		const entries = service.getEntries();
		const pages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
		const text = entries
			.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
			.map(formatEntry)
			.join("; ");
		const next = page + 1 < pages ? " Submit for the next page." : "";
		this.addTextField(
			`Page ${page + 1} of ${pages}. Click the box, select all (Ctrl+A), then copy (Ctrl+C).${next}`,
			"",
			() => {},
			{ defaultValue: text },
		);
		this.show(context.getSourcePlayer(), sceneManager).then((r) => {
			if (r.canceled || !next) return;
			sceneManager.openSceneWithContext(context, CopyLogScene.id, true, page + 1);
		});
	}
}

class ClearLogScene extends ActionUIScene {
	static readonly id = "clear_log";

	constructor(
		sceneManager: SceneManager,
		context: SceneContext,
		service: BehaviourLogService,
	) {
		super(ClearLogScene.id, context.getSourcePlayer());
		this.setContext(context);
		this.setSimpleBody("edu_tools.ui.clear_log.body");
		this.addButton("edu_tools.ui.clear_log.confirm", () => {
			service.clear();
			this.player.sendMessage("§aThe behaviour log has been cleared.");
		});
		this.addButton(
			"edu_tools.ui.buttons.back",
			() => {
				sceneManager.goBackToScene(context, BehaviourLogScene.id);
			},
			"textures/edu_tools/ui/_general/back",
		);
		this.show(context.getSourcePlayer(), sceneManager);
	}
}
