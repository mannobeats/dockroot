import "server-only";

import { auth } from "@dockroot/auth";
import { getServerSession } from "@/lib/session";

export const appRoles = ["owner", "admin", "member"] as const;
export type AppRole = (typeof appRoles)[number];

export function getRoleFromSession(session: Awaited<ReturnType<typeof getServerSession>>): AppRole {
	const role = session?.user && "role" in session.user ? session.user.role : undefined;
	return role === "owner" || role === "admin" || role === "member" ? role : "member";
}

export function isPrivilegedRole(role: AppRole) {
	return role === "owner" || role === "admin";
}

export async function requireUserSession(requestHeaders?: Headers) {
	const session = requestHeaders
		? await auth.api.getSession({
				headers: requestHeaders,
			})
		: await getServerSession();

	if (!session?.user.id) {
		throw new Error("Unauthorized");
	}

	return {
		session,
		userId: session.user.id,
		role: getRoleFromSession(session),
	};
}

export async function requirePrivilegedSession(requestHeaders?: Headers) {
	const auth = await requireUserSession(requestHeaders);

	if (!isPrivilegedRole(auth.role)) {
		throw new Error("Forbidden");
	}

	return auth;
}

export function sanitizeInternalRedirectPath(value: string | null | undefined) {
	if (!value) {
		return "/dashboard/projects";
	}

	if (!value.startsWith("/") || value.startsWith("//")) {
		return "/dashboard/projects";
	}

	return value;
}
