import { type Dispatch, type SetStateAction, useEffect } from "react";

export function useRemoteLiveLogsPolling({
	transport,
	environmentId,
	selectedIds,
	paused,
	setLogsByContainer,
}: {
	transport: "local" | "remote";
	environmentId?: string;
	selectedIds: string[];
	paused: boolean;
	setLogsByContainer: Dispatch<SetStateAction<Record<string, string>>>;
}) {
	useEffect(() => {
		if (transport !== "remote" || !environmentId || !selectedIds.length) {
			return;
		}

		let cancelled = false;
		const abortController = new AbortController();

		const refreshLogs = async () => {
			if (paused || abortController.signal.aborted) {
				return;
			}

			try {
				const entries = await Promise.all(
					selectedIds.map(async (containerId) => {
						const params = new URLSearchParams({
							environmentId,
							containerId,
							tail: "150",
						});
						const response = await fetch(`/api/runtime/logs?${params.toString()}`, {
							cache: "no-store",
							signal: abortController.signal,
						});
						const text = await response.text();
						return [containerId, text] as const;
					}),
				);

				if (!cancelled && !abortController.signal.aborted) {
					setLogsByContainer((current) => ({
						...current,
						...Object.fromEntries(entries),
					}));
				}
			} catch {
				// Swallow AbortError and fetch failures during cleanup
			}
		};

		void refreshLogs();
		const interval = window.setInterval(() => {
			void refreshLogs();
		}, 2000);

		return () => {
			cancelled = true;
			abortController.abort();
			window.clearInterval(interval);
		};
	}, [environmentId, paused, selectedIds, setLogsByContainer, transport]);
}
