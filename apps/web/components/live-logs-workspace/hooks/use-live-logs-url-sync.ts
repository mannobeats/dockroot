import type { ReadonlyURLSearchParams } from "next/navigation";
import { useEffect } from "react";
import type { LiveLogsMode } from "../types";

export function useLiveLogsUrlSync({
	mode,
	selectedIds,
	pathname,
	searchParams,
	replaceUrl,
}: {
	mode: LiveLogsMode;
	selectedIds: string[];
	pathname: string;
	searchParams: ReadonlyURLSearchParams;
	replaceUrl: (nextUrl: string) => void;
}) {
	useEffect(() => {
		const params = new URLSearchParams(searchParams.toString());
		params.set("mode", mode);

		if (mode === "grouped") {
			params.delete("container");
			if (selectedIds.length) {
				params.set("containers", selectedIds.join(","));
			} else {
				params.delete("containers");
			}
		} else {
			params.delete("containers");
			if (selectedIds[0]) {
				params.set("container", selectedIds[0]);
			} else {
				params.delete("container");
			}
		}

		if (params.toString() === searchParams.toString()) {
			return;
		}

		replaceUrl(`${pathname}?${params.toString()}`);
	}, [mode, pathname, replaceUrl, searchParams, selectedIds]);
}
