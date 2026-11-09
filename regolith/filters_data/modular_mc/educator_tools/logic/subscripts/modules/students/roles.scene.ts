import { world } from "@minecraft/server";
import { SceneContext } from "../scene_manager/scene-context.ts";
import { SceneManager } from "../scene_manager/scene-manager.ts";
import { ActionUIScene, ModalUIScene } from "../scene_manager/ui-scene.ts";
import { StudentsService } from "./students.service.ts";

type Person = { id: string; name: string; online: boolean };

const byName = (a: Person, b: Person) => a.name.localeCompare(b.name);

/** Lists online students plus anyone offline who already has the role. */
function people(
	service: StudentsService,
	holders: Record<string, string>,
): Person[] {
	const online = service.getOnlineStudents().map((s) => ({
		id: s.id,
		name: s.name,
		online: true,
	}));
	const listed = new Set(online.map((p) => p.id));
	// Assigned teachers aren't students, so add them whether online or not.
	const connected = new Set(world.getAllPlayers().map((p) => p.id));
	const others = Object.entries(holders)
		.filter(([id]) => !listed.has(id))
		.map(([id, name]) => ({ id, name, online: connected.has(id) }));
	return [...online, ...others].sort(byName);
}

/** Chooses which role to manage: Teachers or Helpers. */
export class RolesScene extends ActionUIScene {
	static readonly id = "roles";

	constructor(
		sceneManager: SceneManager,
		context: SceneContext,
		service: StudentsService,
	) {
		super(RolesScene.id, context.getSourcePlayer());
		this.setContext(context);
		const list = (items: Record<string, string>) =>
			Object.values(items).join(", ") || "nobody";
		this.setRawBody([{
			text:
				`§lTeachers:§r ${list(service.getAssignedTeachers())}\n§lHelpers:§r ${list(service.getHelpers())}\n\nTeachers have full control. Helpers can only teleport to students who have put up a help flag.`,
		}]);
		this.addButton("edu_tools.ui.roles.teachers", () => {
			sceneManager.openSceneWithContext(context, RoleSwitchesScene.teachersId, true);
		}, "textures/edu_tools/ui/main/trusted_players");
		this.addButton("edu_tools.ui.roles.helpers", () => {
			sceneManager.openSceneWithContext(context, RoleSwitchesScene.helpersId, true);
		}, "textures/edu_tools/ui/main/help_flag");
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

/**
 * One switch per person: on means they have the role, off means they don't.
 * Used for both the Teachers page and the Helpers page.
 */
export class RoleSwitchesScene extends ModalUIScene {
	static readonly teachersId = "roles_teachers";
	static readonly helpersId = "roles_helpers";

	constructor(
		sceneManager: SceneManager,
		context: SceneContext,
		service: StudentsService,
		role: "teacher" | "helper",
	) {
		super(
			role === "teacher" ? RoleSwitchesScene.teachersId : RoleSwitchesScene.helpersId,
			context.getSourcePlayer(),
		);
		this.setContext(context);
		const holders = role === "teacher"
			? service.getAssignedTeachers()
			: service.getHelpers();
		const rows = people(service, holders);
		if (rows.length === 0) {
			sceneManager.openSceneWithContext(context, "not_enough_players", true);
			return;
		}

		const choices = new Map<string, boolean>();
		for (const person of rows) {
			this.addToggle(
				person.online ? person.name : `${person.name} §7(offline)§r`,
				(v) => choices.set(person.id, v),
				{ defaultValue: person.id in holders },
			);
		}

		this.show(context.getSourcePlayer(), sceneManager).then((r) => {
			if (r.canceled) return;
			const added: Person[] = [];
			const removed: string[] = [];
			for (const person of rows) {
				const on = choices.get(person.id) === true;
				const was = person.id in holders;
				if (on && !was) added.push(person);
				if (!on && was) {
					if (role === "teacher") service.removeTeacher(person.id);
					else service.removeHelper(person.id);
					removed.push(person.name);
				}
			}
			if (added.length) {
				if (role === "teacher") service.addTeachers(added);
				else service.addHelpers(added);
			}
			const label = role === "teacher" ? "teacher" : "helper";
			const parts: string[] = [];
			if (added.length) {
				parts.push(`Now a ${label}: ${added.map((p) => p.name).join(", ")}`);
			}
			if (removed.length) {
				parts.push(`No longer a ${label}: ${removed.join(", ")}`);
			}
			this.player.sendMessage(
				parts.length ? `§a${parts.join(". ")}.` : "§7No changes made.",
			);
		});
	}
}
