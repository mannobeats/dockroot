import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { sanitizeInternalRedirectPath } from "@/lib/authorization";
import {
	getGitHubAppInstallUrl,
	getGitHubProviderConfigById,
	isGitHubAppConfigured,
	signGitHubAppState,
} from "@/lib/github-app";
import { resolveRequestOrigin } from "@/lib/manager-url";
import { getServerSession } from "@/lib/session";

function shouldUseSecureCookies() {
	return process.env.SESSION_COOKIE_SECURE === undefined
		? process.env.NODE_ENV === "production"
		: process.env.SESSION_COOKIE_SECURE === "true";
}

export async function GET(request: Request) {
	const requestHeaders = await headers();
	const requestOrigin = resolveRequestOrigin({
		headersLike: requestHeaders,
		requestUrl: request.url,
	});

	if (!(await isGitHubAppConfigured())) {
		return NextResponse.json({ error: "GitHub App is not configured." }, { status: 503 });
	}

	const session = await getServerSession();
	if (!session?.user.id) {
		return NextResponse.redirect(new URL("/sign-in", requestOrigin));
	}

	const url = new URL(request.url);
	const redirectTo = sanitizeInternalRedirectPath(url.searchParams.get("redirectTo"));
	const providerId = (url.searchParams.get("providerId") || "").trim() || null;

	if (providerId && !(await getGitHubProviderConfigById(providerId))) {
		return NextResponse.json({ error: "GitHub App provider not found." }, { status: 404 });
	}
	const state = signGitHubAppState({
		userId: session.user.id,
		redirectTo,
		providerId,
	});
	const response = NextResponse.redirect(await getGitHubAppInstallUrl(state, providerId));
	response.cookies.set("dockroot_github_redirect_to", redirectTo, {
		httpOnly: true,
		sameSite: "lax",
		secure: shouldUseSecureCookies(),
		path: "/",
		maxAge: 60 * 10,
	});
	response.cookies.set("dockroot_github_user_id", session.user.id, {
		httpOnly: true,
		sameSite: "lax",
		secure: shouldUseSecureCookies(),
		path: "/",
		maxAge: 60 * 10,
	});
	response.cookies.set("dockroot_github_provider_id", providerId || "", {
		httpOnly: true,
		sameSite: "lax",
		secure: shouldUseSecureCookies(),
		path: "/",
		maxAge: 60 * 10,
	});

	return response;
}
