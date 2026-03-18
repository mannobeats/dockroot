import { randomUUID } from "node:crypto";

export function createRuntimeActionJournal({ io, sql, isPrivilegedRole, maxEvents = 200 }) {
	const runtimeActionEvents = [];

	function emitRuntimeAction(type, payload = {}) {
		const status = type.includes("failed") || type.includes("error") ? "error" : "success";
		const event = {
			id: randomUUID(),
			at: Date.now(),
			type,
			status,
			...payload,
		};

		runtimeActionEvents.push(event);
		if (runtimeActionEvents.length > maxEvents) {
			runtimeActionEvents.splice(0, runtimeActionEvents.length - maxEvents);
		}

		for (const [socketId, socket] of io.of("/").sockets) {
			if (socket.data?.role && isPrivilegedRole(socket.data.role)) {
				io.to(socketId).emit("runtime:action", event);
			}
		}

		void sql`
			insert into runtime_action_events (
				id,
				environment_id,
				actor_user_id,
				actor_role,
				source,
				action_type,
				status,
				container_id,
				session_id,
				details,
				occurred_at,
				created_at
			)
			values (
				${event.id},
				${payload.environmentId ? String(payload.environmentId) : null},
				${payload.userId ? String(payload.userId) : null},
				${payload.role ? String(payload.role) : null},
				${"socket"},
				${event.type},
				${event.status},
				${payload.containerId ? String(payload.containerId) : null},
				${payload.sessionId ? String(payload.sessionId) : null},
				${JSON.stringify(payload)},
				${new Date(event.at)},
				${new Date(event.at)}
			)
		`.catch((error) => {
			console.error(
				"[runtime] Failed to persist runtime action event:",
				error instanceof Error ? error.message : "unknown error",
			);
		});
	}

	function listRuntimeActionEvents(limit = 100) {
		const normalizedLimit = Math.max(1, Math.min(500, Number(limit || 100)));
		return runtimeActionEvents.slice(-normalizedLimit);
	}

	return {
		emitRuntimeAction,
		listRuntimeActionEvents,
	};
}
