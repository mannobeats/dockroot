import { NextResponse } from "next/server";
import {
	getGitHubAppInstallUrl,
	isGitHubAppConfigured,
	signGitHubAppState,
} from "@/lib/github-app";
import { getServerSession } from "@/lib/session";

export async function GET(request: Request) {
	if (!isGitHubAppConfigured()) {
		return NextResponse.json({ error: "GitHub App is not configured." }, { status: 503 });
	}

	const session = await getServerSession();
	if (!session?.user.id) {
		return NextResponse.redirect(new URL("/sign-in", request.url));
	}

	const url = new URL(request.url);
	const redirectTo = url.searchParams.get("redirectTo") || "/dashboard/projects";
	const state = signGitHubAppState({
		userId: session.user.id,
		redirectTo,
	});
	const response = NextResponse.redirect(getGitHubAppInstallUrl(state));
	response.cookies.set("dockroot_github_redirect_to", redirectTo, {
		httpOnly: true,
		sameSite: "lax",
		path: "/",
		maxAge: 60 * 10,
	});
	response.cookies.set("dockroot_github_user_id", session.user.id, {
		httpOnly: true,
		sameSite: "lax",
		path: "/",
		maxAge: 60 * 10,
	});

	return response;
}
