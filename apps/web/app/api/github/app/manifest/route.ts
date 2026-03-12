import { NextResponse } from "next/server";
import { requirePrivilegedSession, sanitizeInternalRedirectPath } from "@/lib/authorization";
import { signGitHubManifestState } from "@/lib/github-app";

function inferPublicAppUrl(request: Request) {
	const explicit =
		process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL;
	if (explicit) {
		return explicit.replace(/\/$/, "");
	}
	return new URL(request.url).origin;
}

function escapeHtmlAttr(value: string) {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
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
	const requestedName = (url.searchParams.get("name") || "Dockroot GitHub App").trim();
	const providerName = requestedName.slice(0, 120) || "Dockroot GitHub App";
	const providerOwner = (url.searchParams.get("owner") || "").trim() || null;
	const appUrl = inferPublicAppUrl(request);
	const state = await signGitHubManifestState({
		userId,
		redirectTo,
		providerName,
		providerOwner,
	});

	const manifest = {
		name: providerName,
		url: appUrl,
		hook_attributes: {
			url: `${appUrl}/api/github/webhook`,
		},
		redirect_url: `${appUrl}/api/github/app/manifest/callback`,
		callback_urls: [`${appUrl}/api/github/callback`],
		setup_url: `${appUrl}/dashboard/stacks?github=connected`,
		setup_on_update: true,
		public: false,
		request_oauth_on_install: true,
		default_permissions: {
			contents: "read",
			metadata: "read",
			emails: "read",
			pull_requests: "write",
		},
		default_events: ["push", "installation", "installation_repositories"],
	};

	const manifestPayload = JSON.stringify(manifest);
	const baseAction = providerOwner
		? `https://github.com/organizations/${encodeURIComponent(providerOwner)}/settings/apps/new`
		: "https://github.com/settings/apps/new";
	const actionUrl = `${baseAction}?state=${encodeURIComponent(state)}`;
	const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Redirecting to GitHub...</title>
  </head>
  <body>
    <form id="github-manifest-form" method="post" action="${escapeHtmlAttr(actionUrl)}">
      <input type="hidden" name="manifest" value="${escapeHtmlAttr(manifestPayload)}" />
      <noscript>
        <button type="submit">Continue to GitHub</button>
      </noscript>
    </form>
    <script>
      document.getElementById("github-manifest-form")?.submit();
    </script>
  </body>
</html>`;

	return new NextResponse(html, {
		headers: {
			"content-type": "text/html; charset=utf-8",
			"cache-control": "no-store",
		},
	});
}
