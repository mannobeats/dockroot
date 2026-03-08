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
	const redirectToCookie = request.headers
		.get("cookie")
		?.match(/(?:^|; )dockroot_github_redirect_to=([^;]+)/)?.[1];
	const userIdCookie = request.headers
		.get("cookie")
		?.match(/(?:^|; )dockroot_github_user_id=([^;]+)/)?.[1];

	if (!installationId) {
		return NextResponse.redirect(new URL("/dashboard/projects?github=missing", request.url));
	}

	let redirectTo = decodeURIComponent(redirectToCookie || "/dashboard/projects");

	if (state) {
		const parsedState = verifyGitHubAppState(state);
		if (parsedState.userId !== session.user.id) {
			return NextResponse.redirect(new URL("/dashboard/projects?github=denied", request.url));
		}
		redirectTo = parsedState.redirectTo;
	} else if (userIdCookie && decodeURIComponent(userIdCookie) !== session.user.id) {
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
		path: "/",
		maxAge: 0,
	});
	response.cookies.set("dockroot_github_user_id", "", {
		httpOnly: true,
		sameSite: "lax",
		path: "/",
		maxAge: 0,
	});

	return response;
}
