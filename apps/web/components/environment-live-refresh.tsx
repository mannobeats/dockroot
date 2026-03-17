"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { getSocket } from "@/lib/socket-client";

export function EnvironmentLiveRefresh({ environmentId }: { environmentId?: string }) {
	const router = useRouter();
	const refreshTimer = useRef<number | null>(null);

	useEffect(() => {
		const socket = getSocket();

		const onUpdate = (payload: { environmentId?: string } | null) => {
			if (environmentId && payload?.environmentId && payload.environmentId !== environmentId) {
				return;
			}

			if (refreshTimer.current) {
				window.clearTimeout(refreshTimer.current);
			}

			refreshTimer.current = window.setTimeout(() => {
				router.refresh();
			}, 150);
		};

		socket.on("environment:update", onUpdate);

		return () => {
			socket.off("environment:update", onUpdate);
			if (refreshTimer.current) {
				window.clearTimeout(refreshTimer.current);
			}
		};
	}, [environmentId, router]);

	return null;
}
