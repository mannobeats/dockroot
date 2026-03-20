import "server-only";

export function emitRealtime(event: string, payload: unknown) {
	globalThis.__dockroot_io?.emit(event, payload);
}

export function emitToRoom(room: string, event: string, payload: unknown) {
	globalThis.__dockroot_io?.to(room).emit(event, payload);
}

export function cacheRuntimeSnapshot(
	environmentId: string,
	snapshot: unknown,
	sampledAt = Date.now(),
) {
	globalThis.__dockroot_set_runtime_snapshot?.(environmentId, snapshot, sampledAt);
}

export function getCachedRuntimeSnapshot<T>(environmentId: string, maxAgeMs?: number) {
	const entry = globalThis.__dockroot_get_runtime_snapshot?.(environmentId, maxAgeMs);
	if (!entry) {
		return null;
	}

	return {
		snapshot: entry.snapshot as T,
		sampledAt: entry.sampledAt,
	};
}

/** Register a container action initiated by Dockroot to prevent daemon event duplication. */
export function registerDockrootAction(containerId: string, action: string) {
	const fn = (globalThis as Record<string, unknown>).__dockroot_register_action;
	if (typeof fn === "function") {
		fn(containerId, action);
	}
}
