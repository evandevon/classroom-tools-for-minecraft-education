import { SceneContext } from "../scene_manager/scene-context.ts";
import { SceneManager } from "../scene_manager/scene-manager.ts";
import { ModalUIScene } from "../scene_manager/ui-scene.ts";
import { Selection } from "./timed-entries.ts";

export interface PlayerSelectOptions {
	players: { id: string; name: string; status?: string }[];
	everybodyLabel?: string; // Leave out to offer named players only
	onSelected: (selection: Selection) => void;
}

/** Tick one or more students, or tick Everybody. */
export class PlayerSelectScene extends ModalUIScene {
	static readonly id = "player_select";

	constructor(
		sceneManager: SceneManager,
		context: SceneContext,
		options: PlayerSelectOptions,
	) {
		super(PlayerSelectScene.id, context.getSourcePlayer());
		this.setContext(context);

		let everybody = false;
		const chosen: { id: string; name: string }[] = [];
		if (options.everybodyLabel) {
			this.addToggle(options.everybodyLabel, (v) => {
				everybody = v;
			});
		}
		for (const p of options.players) {
			const label = p.status ? `${p.name} §7(${p.status})§r` : p.name;
			this.addToggle(label, (v) => {
				if (v) chosen.push({ id: p.id, name: p.name });
			});
		}

		this.show(context.getSourcePlayer(), sceneManager).then((r) => {
			if (r.canceled) return;
			if (!everybody && chosen.length === 0) {
				this.player.sendMessage("§eNobody was selected.");
				return;
			}
			options.onSelected({
				everybody,
				players: everybody ? [...options.players] : chosen,
			});
		});
	}
}
