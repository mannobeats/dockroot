"use client";

import { useCallback, useEffect, useState } from "react";
import {
	ALL_COLUMNS,
	getDefaultColumns,
	loadStoredColumns,
	persistColumns,
} from "@/components/containers-table-workspace/columns";
import type { ColumnId } from "@/components/containers-table-workspace/types";

export function useColumnVisibility() {
	const [visibleColumns, setVisibleColumns] = useState<Set<ColumnId>>(getDefaultColumns);

	useEffect(() => {
		const stored = loadStoredColumns();
		if (stored) {
			setVisibleColumns(stored);
		}
	}, []);

	const toggleColumn = useCallback((columnId: ColumnId) => {
		const column = ALL_COLUMNS.find((entry) => entry.id === columnId);
		if (column?.alwaysVisible) {
			return;
		}
		setVisibleColumns((previous) => {
			const next = new Set(previous);
			if (next.has(columnId)) {
				next.delete(columnId);
			} else {
				next.add(columnId);
			}
			persistColumns(next);
			return next;
		});
	}, []);

	return {
		visibleColumns,
		toggleColumn,
		isVisible: (columnId: ColumnId) => visibleColumns.has(columnId),
	};
}
