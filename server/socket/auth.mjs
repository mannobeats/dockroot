async function getSessionFromSocket(socket, getAppBaseUrl) {
	const cookie = socket.request.headers.cookie;
	if (!cookie) {
		return null;
	}

	const response = await fetch(`${getAppBaseUrl()}/api/auth/get-session?disableCookieCache=true`, {
		headers: {
			cookie,
			accept: "application/json",
		},
	});

	if (!response.ok) {
		return null;
	}

	const payloadUnknown = await response.json().catch(() => null);
	/** @type {{ user?: { id?: string; role?: string } } | null} */
	const payload = payloadUnknown;
	if (!payload?.user?.id) {
		return null;
	}

	return {
		userId: payload.user.id,
		role:
			payload.user.role === "owner" || payload.user.role === "admin" || payload.user.role === "member"
				? payload.user.role
				: "member",
	};
}

export function attachSocketAuthMiddleware({
	io,
	isTrustedOrigin,
	getAppBaseUrl,
	maxSocketConnectionsPerUser,
	wsRejectionCounters,
}) {
	io.use(async (socket, nextMiddleware) => {
		try {
			const requestOrigin = String(socket.request.headers.origin || "").trim();
			if (requestOrigin && !isTrustedOrigin(requestOrigin, socket.request.headers)) {
				wsRejectionCounters.origin += 1;
				nextMiddleware(new Error("Socket origin denied."));
				return;
			}

			const auth = await getSessionFromSocket(socket, getAppBaseUrl);
			if (!auth) {
				wsRejectionCounters.unauthorized += 1;
				nextMiddleware(new Error("Unauthorized"));
				return;
			}

			let activeConnectionsForUser = 0;
			for (const connected of io.of("/").sockets.values()) {
				if (connected.data?.userId === auth.userId) {
					activeConnectionsForUser += 1;
				}
			}
			if (activeConnectionsForUser >= maxSocketConnectionsPerUser) {
				wsRejectionCounters.connectionLimit += 1;
				nextMiddleware(new Error("Too many active socket connections."));
				return;
			}

			socket.data.userId = auth.userId;
			socket.data.role = auth.role;
			nextMiddleware();
		} catch (error) {
			nextMiddleware(error instanceof Error ? error : new Error("Unauthorized"));
		}
	});
}
