import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { sanitizeInternalRedirectPath } from "@/lib/authorization";
import { getGitHubProviderConfigById, verifyGitHubAppState } from "@/lib/github-app";
import { syncGitHubInstallation } from "@/lib/platform";
import { getServerSession } from "@/lib/session";

function shouldUseSecureCookies() {
	return process.env.SESSION_COOKIE_SECURE === undefined
		? process.env.NODE_ENV === "production"
		: process.env.SESSION_COOKIE_SECURE === "true";
}

export async function GET(request: Request) {
	const session = await getServerSession();
	if (!session?.user.id) {
		const currentPath = new URL(request.url);
		const returnTo = `${currentPath.pathname}${currentPath.search}`;
		return NextResponse.redirect(
			new URL(`/sign-in?redirectTo=${encodeURIComponent(returnTo)}`, request.url),
		);
	}

	const url = new URL(request.url);
	const installationId = url.searchParams.get("installation_id");
	const state = url.searchParams.get("state");
	const cookieStore = await cookies();
	const redirectToCookie = cookieStore.get("dockroot_github_redirect_to")?.value;
	const userIdCookie = cookieStore.get("dockroot_github_user_id")?.value;
	const providerIdCookie = cookieStore.get("dockroot_github_provider_id")?.value;

	if (!installationId) {
		return NextResponse.redirect(new URL("/dashboard/stacks?github=missing", request.url));
	}

	let redirectTo = sanitizeInternalRedirectPath(redirectToCookie || "/dashboard/stacks");
	let providerId: string | null = (providerIdCookie || "").trim() || null;

	if (state) {
		const parsedState = verifyGitHubAppState(state);
		if (parsedState.userId !== session.user.id) {
			return NextResponse.redirect(new URL("/dashboard/stacks?github=denied", request.url));
		}
		redirectTo = sanitizeInternalRedirectPath(parsedState.redirectTo);
		providerId = parsedState.providerId?.trim() || providerId;
	} else if (userIdCookie && userIdCookie !== session.user.id) {
		return NextResponse.redirect(new URL("/dashboard/stacks?github=denied", request.url));
	}

	if (providerId && !(await getGitHubProviderConfigById(providerId))) {
		return NextResponse.redirect(new URL("/dashboard/stacks?github=provider-missing", request.url));
	}

	await syncGitHubInstallation({
		userId: session.user.id,
		githubInstallationId: installationId,
		providerId: providerId || undefined,
	});

	const separator = redirectTo.includes("?") ? "&" : "?";
	const response = NextResponse.redirect(
		new URL(`${redirectTo}${separator}github=connected`, request.url),
	);
	response.cookies.set("dockroot_github_redirect_to", "", {
		httpOnly: true,
		sameSite: "lax",
		secure: shouldUseSecureCookies(),
		path: "/",
		maxAge: 0,
	});
	response.cookies.set("dockroot_github_user_id", "", {
		httpOnly: true,
		sameSite: "lax",
		secure: shouldUseSecureCookies(),
		path: "/",
		maxAge: 0,
	});
	response.cookies.set("dockroot_github_provider_id", "", {
		httpOnly: true,
		sameSite: "lax",
		secure: shouldUseSecureCookies(),
		path: "/",
		maxAge: 0,
	});

	return response;
}
