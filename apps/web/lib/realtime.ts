import "server-only";

export function emitRealtime(event: string, payload: unknown) {
	globalThis.__dockroot_io?.emit(event, payload);
}

export function emitToRoom(room: string, event: string, payload: unknown) {
	globalThis.__dockroot_io?.to(room).emit(event, payload);
}
