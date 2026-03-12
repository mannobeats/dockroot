import { NextResponse } from "next/server";
import { requirePrivilegedSession, sanitizeInternalRedirectPath } from "@/lib/authorization";
import { getGitHubManifestCreateUrl, signGitHubManifestState } from "@/lib/github-app";

function inferPublicAppUrl(request: Request) {
	const explicit =
		process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL;
	if (explicit) {
		return explicit.replace(/\/$/, "");
	}
	return new URL(request.url).origin;
}

export async function GET(request: Request) {
	let userId = "";
	try {
		const auth = await requirePrivilegedSession();
		userId = auth.userId;
	} catch {
		return NextResponse.redirect(new URL("/dashboard/stacks?github=forbidden", request.url));
	}

	const url = new URL(request.url);
	const redirectTo = sanitizeInternalRedirectPath(url.searchParams.get("redirectTo"));
	const appUrl = inferPublicAppUrl(request);
	const state = await signGitHubManifestState({
		userId,
		redirectTo,
	});

	const manifest = {
		name: "Dockroot",
		url: appUrl,
		hook_attributes: {
			url: `${appUrl}/api/github/webhook`,
		},
		redirect_url: `${appUrl}/api/github/app/manifest/callback`,
		setup_url: `${appUrl}/dashboard/stacks?github=connected`,
		setup_on_update: true,
		public: false,
		default_permissions: {
			contents: "read",
			metadata: "read",
			pull_requests: "read",
		},
		default_events: ["push", "installation", "installation_repositories"],
	};

	return NextResponse.redirect(getGitHubManifestCreateUrl(manifest, state));
}
