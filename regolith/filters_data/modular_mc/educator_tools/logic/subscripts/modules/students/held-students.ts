import { Player } from "@minecraft/server";
import { formatTimeLeft, TimedEntries, TimedEntry } from "./timed-entries.ts";

export function statusFor<T>(
	entry: TimedEntry<T> | undefined,
	word: string,
): string | undefined {
	if (!entry) return undefined;
	return entry.until === null
		? `${word}, no time limit`
		: `${word}, ${formatTimeLeft(entry.until)} left`;
}

/** Everyone currently held, including named students who are offline. */
export function heldStudents<T>(
	online: Player[],
	entries: TimedEntries<T>,
	word: string,
): { id: string; name: string; status?: string }[] {
	const held = online
		.filter((s) => entries.effective(s.id))
		.map((s) => ({
			id: s.id,
			name: s.name,
			status: statusFor(entries.effective(s.id), word),
		}));
	for (const { id, entry } of entries.namedEntries()) {
		if (!held.some((h) => h.id === id) && entries.effective(id)) {
			held.push({
				id,
				name: entry.name ?? id,
				status: `${statusFor(entry, word)}, offline`,
			});
		}
	}
	return held;
}
