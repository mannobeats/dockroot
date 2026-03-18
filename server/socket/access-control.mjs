export function createSocketAccessControl({ sql, dockerBinary, execFileAsync, isPrivilegedRole }) {
	async function resolveOwnedEnvironmentId(userId, environmentId) {
		const normalized = typeof environmentId === "string" && environmentId.trim() ? environmentId.trim() : "";
		if (!normalized) {
			return "";
		}

		const rows = await sql`
			select id
			from environments
			where id = ${normalized}
			  and created_by_user_id = ${userId}
			limit 1
		`;

		return rows[0]?.id ? String(rows[0].id) : null;
	}

	async function resolveOwnedEnvironmentWithKind(userId, environmentId) {
		const normalized = typeof environmentId === "string" && environmentId.trim() ? environmentId.trim() : "";
		if (!normalized) {
			return { id: "", kind: "local" };
		}

		const rows = await sql`
			select id, kind
			from environments
			where id = ${normalized}
			  and created_by_user_id = ${userId}
			limit 1
		`;

		if (!rows[0]?.id) {
			return null;
		}
		return { id: String(rows[0].id), kind: String(rows[0].kind || "local") };
	}

	async function canAccessStackRoom(userId, role, room) {
		if (isPrivilegedRole(role)) {
			return true;
		}

		const stackId = room.startsWith("stack:") ? room.slice("stack:".length) : "";
		if (!stackId) {
			return false;
		}

		const rows = await sql`
			select 1
			from stacks
			where id = ${stackId}
			  and created_by_user_id = ${userId}
			limit 1
		`;

		return rows.length > 0;
	}

	async function listOwnedStackSlugs(userId) {
		const rows = await sql`
			select slug
			from stacks
			where created_by_user_id = ${userId}
		`;

		return new Set(rows.map((row) => row.slug).filter(Boolean));
	}

	async function getContainerComposeProject(containerId) {
		try {
			const { stdout } = await execFileAsync(
				dockerBinary,
				["inspect", "--format", '{{ index .Config.Labels "com.docker.compose.project" }}', containerId],
				{ maxBuffer: 1024 * 256 },
			);
			return stdout.trim() || null;
		} catch {
			return null;
		}
	}

	async function canAccessContainer(userId, role, containerId) {
		if (isPrivilegedRole(role)) {
			return true;
		}

		const composeProject = await getContainerComposeProject(containerId);
		if (!composeProject) {
			return false;
		}

		const ownedSlugs = await listOwnedStackSlugs(userId);
		return ownedSlugs.has(composeProject);
	}

	return {
		canAccessContainer,
		canAccessStackRoom,
		resolveOwnedEnvironmentId,
		resolveOwnedEnvironmentWithKind,
	};
}
