import type { RefObject } from "react";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import { LogBlock } from "@/components/ui/log-block";
import { Panel } from "@/components/ui/panel";
import type { LiveLogsMode, LogContainer } from "./types";

interface LogsViewerPanelProps {
	mode: LiveLogsMode;
	containers: LogContainer[];
	selectedIds: string[];
	paused: boolean;
	autoScroll: boolean;
	environmentId?: string;
	combinedLogs: string;
	logViewportRef: RefObject<HTMLPreElement | null>;
	onTogglePaused: () => void;
	onToggleAutoScroll: () => void;
	onClearLogs: () => void;
}

export function LogsViewerPanel({
	mode,
	containers,
	selectedIds,
	paused,
	autoScroll,
	environmentId,
	combinedLogs,
	logViewportRef,
	onTogglePaused,
	onToggleAutoScroll,
	onClearLogs,
}: LogsViewerPanelProps) {
	const activeContainerName = containers.find((item) => item.id === selectedIds[0])?.name;

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<Panel padding="md" className="flex h-full flex-col overflow-hidden">
				<div className="flex items-center justify-between">
					<div>
						<p className="text-sm font-semibold tracking-tight">
							{mode === "grouped" ? "Grouped logs" : activeContainerName || "Logs"}
						</p>
						<p className="text-xs text-muted">
							{mode === "grouped" ? `${selectedIds.length} containers` : "docker logs -f"}
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-1.5">
						<Button type="button" onClick={onTogglePaused} variant="outline" size="xs">
							{paused ? "Resume" : "Pause"}
						</Button>
						<Button
							type="button"
							onClick={onToggleAutoScroll}
							variant={autoScroll ? "secondary" : "outline"}
							size="xs"
						>
							Auto-scroll
						</Button>
						<Button type="button" onClick={onClearLogs} variant="outline" size="xs">
							Clear
						</Button>
						{selectedIds[0] ? (
							<LinkButton
								href={`/dashboard/shell?target=container&containerId=${selectedIds[0]}${
									environmentId ? `&environment=${environmentId}` : ""
								}`}
								variant="outline"
								size="xs"
							>
								Shell
							</LinkButton>
						) : null}
					</div>
				</div>
				<LogBlock ref={logViewportRef} className="mt-3 flex-1 overflow-y-auto p-4">
					{combinedLogs || "No logs available."}
				</LogBlock>
			</Panel>
		</div>
	);
}
