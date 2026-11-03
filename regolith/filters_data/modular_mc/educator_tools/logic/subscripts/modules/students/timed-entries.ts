/** People chosen in a picker. `everybody` also covers students who join later. */
export interface Selection {
	everybody: boolean;
	players: { id: string; name: string }[];
}

export interface TimedEntry<T> {
	until: number | null; // null = until the teacher releases them
	name?: string;
	data: T;
}

interface State<T> {
	everybody: (TimedEntry<T> & { except: string[] }) | null;
	players: Record<string, TimedEntry<T>>;
}

export interface PropertyStore {
	getDynamicProperty(key: string): unknown;
	setDynamicProperty(key: string, value?: string): void;
}

/** Who a freeze or lock applies to, and when it ends. Saved with the world. */
export class TimedEntries<T> {
	private state: State<T> = { everybody: null, players: {} };

	constructor(
		private readonly store: PropertyStore,
		private readonly key: string,
		private readonly now: () => number = () => Date.now(),
	) {
		const raw = store.getDynamicProperty(key);
		if (typeof raw === "string") {
			try {
				this.state = JSON.parse(raw);
			} catch (e) {
				console.warn(`Could not read saved ${key}: ${e}`);
			}
		}
	}

	private save(): void {
		this.store.setDynamicProperty(this.key, JSON.stringify(this.state));
	}

	apply(selection: Selection, minutes: number | null, data: T): void {
		const until = minutes === null ? null : this.now() + minutes * 60000;
		if (selection.everybody) {
			this.state = { everybody: { until, data, except: [] }, players: {} };
		} else {
			for (const p of selection.players) {
				this.state.players[p.id] = { until, name: p.name, data };
			}
		}
		this.save();
	}

	release(ids: string[]): void {
		for (const id of ids) {
			delete this.state.players[id];
			const all = this.state.everybody;
			if (all && !all.except.includes(id)) all.except.push(id);
		}
		this.save();
	}

	releaseAll(): void {
		this.state = { everybody: null, players: {} };
		this.save();
	}

	/** The freeze or lock currently affecting this player, if any. */
	effective(id: string): TimedEntry<T> | undefined {
		const t = this.now();
		const own = this.state.players[id];
		if (own && (own.until === null || own.until > t)) return own;
		const all = this.state.everybody;
		if (
			all && !all.except.includes(id) &&
			(all.until === null || all.until > t)
		) {
			return all;
		}
		return undefined;
	}

	/** Removes anything whose time is up and reports what ended. */
	sweep(): { names: string[]; everybody: boolean } {
		const t = this.now();
		const names: string[] = [];
		let everybody = false;
		for (const [id, entry] of Object.entries(this.state.players)) {
			if (entry.until !== null && entry.until <= t) {
				names.push(entry.name ?? id);
				delete this.state.players[id];
			}
		}
		const all = this.state.everybody;
		if (all && all.until !== null && all.until <= t) {
			everybody = true;
			this.state.everybody = null;
		}
		if (names.length || everybody) this.save();
		return { names, everybody };
	}

	/** Named entries, including students who are currently offline. */
	namedEntries(): { id: string; entry: TimedEntry<T> }[] {
		return Object.entries(this.state.players).map(([id, entry]) => ({
			id,
			entry,
		}));
	}

	isEmpty(): boolean {
		return !this.state.everybody &&
			Object.keys(this.state.players).length === 0;
	}
}

export const DURATIONS: { label: string; minutes: number | null }[] = [
	{ label: "Until I release them", minutes: null },
	{ label: "1 minute", minutes: 1 },
	{ label: "2 minutes", minutes: 2 },
	{ label: "3 minutes", minutes: 3 },
	{ label: "5 minutes", minutes: 5 },
	{ label: "10 minutes", minutes: 10 },
	{ label: "15 minutes", minutes: 15 },
	{ label: "20 minutes", minutes: 20 },
	{ label: "30 minutes", minutes: 30 },
	{ label: "45 minutes", minutes: 45 },
	{ label: "60 minutes", minutes: 60 },
];
export const DEFAULT_DURATION_INDEX = 4; // 5 minutes

export function formatTimeLeft(until: number, now = Date.now()): string {
	const total = Math.max(0, Math.ceil((until - now) / 1000));
	const seconds = total % 60;
	return `${Math.floor(total / 60)}:${seconds < 10 ? "0" : ""}${seconds}`;
}

/** Plain-English list of who a selection covers. */
export function describeSelection(selection: Selection): string {
	return selection.everybody
		? "everybody"
		: selection.players.map((p) => p.name).join(", ");
}
