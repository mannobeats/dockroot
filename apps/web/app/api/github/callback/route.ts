import { NextResponse } from "next/server";
import { verifyGitHubAppState } from "@/lib/github-app";
import { syncGitHubInstallation } from "@/lib/platform";
import { getServerSession } from "@/lib/session";

export async function GET(request: Request) {
	const session = await getServerSession();
	if (!session?.user.id) {
		return NextResponse.redirect(new URL("/sign-in", request.url));
	}

	const url = new URL(request.url);
	const installationId = url.searchParams.get("installation_id");
	const state = url.searchParams.get("state");

	if (!installationId || !state) {
		return NextResponse.redirect(new URL("/dashboard/projects?github=missing", request.url));
	}

	const parsedState = verifyGitHubAppState(state);
	if (parsedState.userId !== session.user.id) {
		return NextResponse.redirect(new URL("/dashboard/projects?github=denied", request.url));
	}

	await syncGitHubInstallation({
		userId: session.user.id,
		githubInstallationId: installationId,
	});

	return NextResponse.redirect(new URL(`${parsedState.redirectTo}?github=connected`, request.url));
}
