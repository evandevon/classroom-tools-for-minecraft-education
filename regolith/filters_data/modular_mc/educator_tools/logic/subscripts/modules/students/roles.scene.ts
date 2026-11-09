import { SceneContext } from "../scene_manager/scene-context.ts";
import { SceneManager } from "../scene_manager/scene-manager.ts";
import { ModalUIScene } from "../scene_manager/ui-scene.ts";
import { StudentsService } from "./students.service.ts";

type Person = { id: string; name: string };

/**
 * One screen for roles. Each student has a Helper switch: on means they're a
 * helper, off means they aren't. Assigned teachers have a Teacher switch, and
 * a dropdown makes someone new a teacher.
 */
export class RolesScene extends ModalUIScene {
	static readonly id = "roles";

	constructor(
		sceneManager: SceneManager,
		context: SceneContext,
		service: StudentsService,
	) {
		super(RolesScene.id, context.getSourcePlayer());
		this.setContext(context);

		const byName = (a: Person, b: Person) => a.name.localeCompare(b.name);
		const online = service.getOnlineStudents().map((s) => ({
			id: s.id,
			name: s.name,
		}));
		const onlineIds = new Set(online.map((p) => p.id));
		const helperList = service.getHelpers();
		// Offline helpers are listed too, so they can be switched off.
		const offlineHelpers = Object.entries(helperList)
			.filter(([id]) => !onlineIds.has(id) && !service.isTeacher(id))
			.map(([id, name]) => ({ id, name }));
		const helperRows = [...online, ...offlineHelpers].sort(byName);
		const teacherRows = Object.entries(service.getAssignedTeachers())
			.map(([id, name]) => ({ id, name }))
			.sort(byName);

		const helperChoices = new Map<string, boolean>();
		const teacherChoices = new Map<string, boolean>();
		let newTeacher: Person | undefined;

		for (const person of helperRows) {
			const offline = onlineIds.has(person.id) ? "" : " §7(offline)§r";
			this.addToggle(
				`Helper: ${person.name}${offline}`,
				(v) => helperChoices.set(person.id, v),
				{ defaultValue: person.id in helperList },
			);
		}
		for (const person of teacherRows) {
			this.addToggle(
				`Teacher: ${person.name}`,
				(v) => teacherChoices.set(person.id, v),
				{ defaultValue: true },
			);
		}
		this.addDropdown(
			"Make someone a teacher",
			["Nobody", ...online.map((p) => p.name)],
			(index: number) => {
				newTeacher = index > 0 ? online[index - 1] : undefined;
			},
			{ defaultValueIndex: 0 },
		);

		this.show(context.getSourcePlayer(), sceneManager).then((r) => {
			if (r.canceled) return;
			const changes: string[] = [];
			const nowHelpers: Person[] = [];
			for (const person of helperRows) {
				const on = helperChoices.get(person.id) === true;
				const was = person.id in helperList;
				if (on && !was && newTeacher?.id !== person.id) nowHelpers.push(person);
				if (!on && was) {
					service.removeHelper(person.id);
					changes.push(`${person.name} is no longer a helper`);
				}
			}
			if (nowHelpers.length) {
				service.addHelpers(nowHelpers);
				changes.push(`Now helping: ${nowHelpers.map((p) => p.name).join(", ")}`);
			}
			for (const person of teacherRows) {
				if (teacherChoices.get(person.id) === false) {
					service.removeTeacher(person.id);
					changes.push(`${person.name} is no longer a teacher`);
				}
			}
			if (newTeacher) {
				service.addTeachers([newTeacher]);
				changes.push(`${newTeacher.name} is now a teacher`);
			}
			this.player.sendMessage(
				changes.length ? `§a${changes.join(". ")}.` : "§7No changes made.",
			);
		});
	}
}
