"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ContainerSelectorPanel } from "./container-selector-panel";
import { useLiveLogsUrlSync } from "./hooks/use-live-logs-url-sync";
import { useLocalLiveLogsStream } from "./hooks/use-local-live-logs-stream";
import { useRemoteLiveLogsPolling } from "./hooks/use-remote-live-logs-polling";
import { LogsViewerPanel } from "./logs-viewer-panel";
import type { LiveLogsMode, LiveLogsWorkspaceProps } from "./types";
import { buildCombinedLogs, filterContainers } from "./utils";

export function LiveLogsWorkspace({
	containers,
	initialLogs,
	initialMode,
	initialSelectedIds,
	transport = "local",
	environmentId,
}: LiveLogsWorkspaceProps) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();

	const [query, setQuery] = useState("");
	const [mode, setMode] = useState<LiveLogsMode>(initialMode);
	const [selectedIds, setSelectedIds] = useState<string[]>(initialSelectedIds);
	const [logsByContainer, setLogsByContainer] = useState<Record<string, string>>(initialLogs);
	const [paused, setPaused] = useState(false);
	const [autoScroll, setAutoScroll] = useState(true);
	const logViewportRef = useRef<HTMLPreElement | null>(null);

	const filteredContainers = useMemo(
		() => filterContainers(containers, query),
		[containers, query],
	);

	useEffect(() => {
		if (!selectedIds.length && containers[0]) {
			setSelectedIds([containers[0].id]);
		}
	}, [containers, selectedIds.length]);

	useLiveLogsUrlSync({
		mode,
		selectedIds,
		pathname,
		searchParams,
		replaceUrl: (nextUrl) => {
			router.replace(nextUrl, { scroll: false });
		},
	});

	useLocalLiveLogsStream({
		transport,
		selectedIds,
		paused,
		setLogsByContainer,
	});

	useRemoteLiveLogsPolling({
		transport,
		environmentId,
		selectedIds,
		paused,
		setLogsByContainer,
	});

	const combinedLogs = useMemo(
		() => buildCombinedLogs({ selectedIds, containers, logsByContainer, mode }),
		[selectedIds, containers, logsByContainer, mode],
	);

	useEffect(() => {
		if (!autoScroll || !logViewportRef.current) {
			return;
		}

		logViewportRef.current.scrollTop = logViewportRef.current.scrollHeight;
	});

	return (
		<div className="flex flex-col gap-5 xl:flex-row" style={{ height: "calc(100vh - 180px)" }}>
			<ContainerSelectorPanel
				filteredContainers={filteredContainers}
				query={query}
				mode={mode}
				selectedIds={selectedIds}
				onQueryChange={setQuery}
				onModeChange={setMode}
				onSelectIds={setSelectedIds}
			/>
			<LogsViewerPanel
				mode={mode}
				containers={containers}
				selectedIds={selectedIds}
				paused={paused}
				autoScroll={autoScroll}
				environmentId={environmentId}
				combinedLogs={combinedLogs}
				logViewportRef={logViewportRef}
				onTogglePaused={() => setPaused((current) => !current)}
				onToggleAutoScroll={() => setAutoScroll((current) => !current)}
				onClearLogs={() =>
					setLogsByContainer((current) =>
						Object.fromEntries(Object.keys(current).map((key) => [key, ""])),
					)
				}
			/>
		</div>
	);
}
