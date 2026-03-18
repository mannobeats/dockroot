import { type Dispatch, type SetStateAction, useEffect, useEffectEvent, useRef } from "react";
import { getSocket } from "@/lib/socket-client";

interface LogsDataPayload {
	sessionId: string;
	containerId: string;
	chunk: string;
}

export function useLocalLiveLogsStream({
	transport,
	selectedIds,
	paused,
	setLogsByContainer,
}: {
	transport: "local" | "remote";
	selectedIds: string[];
	paused: boolean;
	setLogsByContainer: Dispatch<SetStateAction<Record<string, string>>>;
}) {
	const sessionIdRef = useRef<string | null>(null);

	const onData = useEffectEvent((payload: LogsDataPayload) => {
		if (paused || payload.sessionId !== sessionIdRef.current) {
			return;
		}

		setLogsByContainer((current) => ({
			...current,
			[payload.containerId]: `${current[payload.containerId] || ""}${payload.chunk}`.slice(-20000),
		}));
	});

	useEffect(() => {
		if (transport !== "local" || !selectedIds.length) {
			return;
		}

		const socket = getSocket();
		const previousSessionId = sessionIdRef.current;
		if (previousSessionId) {
			socket.emit("logs:unsubscribe", { sessionId: previousSessionId });
		}

		setLogsByContainer((current) => ({
			...current,
			...Object.fromEntries(selectedIds.map((containerId) => [containerId, ""])),
		}));

		socket.emit(
			"logs:subscribe",
			{ containerIds: selectedIds, tail: 150 },
			(response: { sessionId?: string }) => {
				if (response.sessionId) {
					sessionIdRef.current = response.sessionId;
				}
			},
		);

		socket.on("logs:data", onData);

		return () => {
			const activeSessionId = sessionIdRef.current;
			if (activeSessionId) {
				socket.emit("logs:unsubscribe", { sessionId: activeSessionId });
				sessionIdRef.current = null;
			}
			socket.off("logs:data", onData);
		};
	}, [selectedIds, setLogsByContainer, transport]);
}
