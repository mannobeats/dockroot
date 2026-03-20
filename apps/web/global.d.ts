import type { Server as SocketIOServer } from "socket.io";

declare global {
	// eslint-disable-next-line no-var
	var __dockroot_io: SocketIOServer | undefined;
	// eslint-disable-next-line no-var
	var __dockroot_get_runtime_snapshot:
		| ((
				environmentId: string,
				maxAgeMs?: number,
		  ) => { snapshot: unknown; sampledAt: number } | null)
		| undefined;
	// eslint-disable-next-line no-var
	var __dockroot_set_runtime_snapshot:
		| ((environmentId: string, snapshot: unknown, sampledAt?: number) => void)
		| undefined;
}
