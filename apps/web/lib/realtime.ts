import "server-only";

export function emitRealtime(event: string, payload: unknown) {
	globalThis.__dockroot_io?.emit(event, payload);
}

export function emitToRoom(room: string, event: string, payload: unknown) {
	globalThis.__dockroot_io?.to(room).emit(event, payload);
}

/** Register a container action initiated by Dockroot to prevent daemon event duplication. */
export function registerDockrootAction(containerId: string, action: string) {
	const fn = (globalThis as Record<string, unknown>).__dockroot_register_action;
	if (typeof fn === "function") {
		fn(containerId, action);
	}
}
