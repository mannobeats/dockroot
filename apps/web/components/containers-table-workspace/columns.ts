import type { ColumnDef, ColumnId } from "@/components/containers-table-workspace/types";

export const ALL_COLUMNS: ColumnDef[] = [
	{ id: "name", label: "Name", defaultVisible: true, alwaysVisible: true },
	{ id: "image", label: "Image", defaultVisible: true },
	{ id: "state", label: "State", defaultVisible: true },
	{ id: "cpu", label: "CPU", defaultVisible: true },
	{ id: "memory", label: "Memory", defaultVisible: true },
	{ id: "uptime", label: "Uptime", defaultVisible: true },
	{ id: "netio", label: "Net I/O", defaultVisible: false },
	{ id: "ports", label: "Ports", defaultVisible: true },
	{ id: "stack", label: "Stack", defaultVisible: true },
	{ id: "updates", label: "Updates", defaultVisible: false },
	{ id: "actions", label: "Actions", defaultVisible: true, alwaysVisible: true },
];

const STORAGE_KEY = "dockroot:containers:columns";
const DEFAULT_COLUMNS = new Set(
	ALL_COLUMNS.filter((column) => column.defaultVisible).map((column) => column.id),
);

export function getDefaultColumns(): Set<ColumnId> {
	return new Set(DEFAULT_COLUMNS);
}

export function loadStoredColumns(): Set<ColumnId> | null {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			const parsed = JSON.parse(stored) as ColumnId[];
			if (Array.isArray(parsed) && parsed.length > 0) {
				const set = new Set(parsed);
				for (const column of ALL_COLUMNS) {
					if (column.alwaysVisible) {
						set.add(column.id);
					}
				}
				return set;
			}
		}
	} catch {
		// Ignore malformed persisted preferences.
	}
	return null;
}

export function persistColumns(columns: Set<ColumnId>) {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify([...columns]));
	} catch {
		// Ignore persistence failures.
	}
}
