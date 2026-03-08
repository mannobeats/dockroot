import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { sanitizeInternalRedirectPath } from "@/lib/authorization";
import { verifyGitHubAppState } from "@/lib/github-app";
import { syncGitHubInstallation } from "@/lib/platform";
import { getServerSession } from "@/lib/session";

function useSecureCookies() {
	return process.env.SESSION_COOKIE_SECURE === undefined
		? process.env.NODE_ENV === "production"
		: process.env.SESSION_COOKIE_SECURE === "true";
}

export async function GET(request: Request) {
	const session = await getServerSession();
	if (!session?.user.id) {
		return NextResponse.redirect(new URL("/sign-in", request.url));
	}

	const url = new URL(request.url);
	const installationId = url.searchParams.get("installation_id");
	const state = url.searchParams.get("state");
	const cookieStore = await cookies();
	const redirectToCookie = cookieStore.get("dockroot_github_redirect_to")?.value;
	const userIdCookie = cookieStore.get("dockroot_github_user_id")?.value;

	if (!installationId) {
		return NextResponse.redirect(new URL("/dashboard/projects?github=missing", request.url));
	}

	let redirectTo = sanitizeInternalRedirectPath(redirectToCookie || "/dashboard/projects");

	if (state) {
		const parsedState = verifyGitHubAppState(state);
		if (parsedState.userId !== session.user.id) {
			return NextResponse.redirect(new URL("/dashboard/projects?github=denied", request.url));
		}
		redirectTo = sanitizeInternalRedirectPath(parsedState.redirectTo);
	} else if (userIdCookie && userIdCookie !== session.user.id) {
		return NextResponse.redirect(new URL("/dashboard/projects?github=denied", request.url));
	}

	await syncGitHubInstallation({
		userId: session.user.id,
		githubInstallationId: installationId,
	});

	const separator = redirectTo.includes("?") ? "&" : "?";
	const response = NextResponse.redirect(
		new URL(`${redirectTo}${separator}github=connected`, request.url),
	);
	response.cookies.set("dockroot_github_redirect_to", "", {
		httpOnly: true,
		sameSite: "lax",
		secure: useSecureCookies(),
		path: "/",
		maxAge: 0,
	});
	response.cookies.set("dockroot_github_user_id", "", {
		httpOnly: true,
		sameSite: "lax",
		secure: useSecureCookies(),
		path: "/",
		maxAge: 0,
	});

	return response;
}
