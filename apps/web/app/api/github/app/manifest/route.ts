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

function isPrivateOrLocalHostname(hostname: string) {
	const normalized = hostname.trim().toLowerCase();
	if (!normalized) {
		return true;
	}
	if (
		normalized === "localhost" ||
		normalized === "127.0.0.1" ||
		normalized === "::1" ||
		normalized.endsWith(".local")
	) {
		return true;
	}
	if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalized)) {
		return true;
	}
	if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(normalized)) {
		return true;
	}
	const match172 = normalized.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
	if (match172) {
		const octet = Number(match172[1]);
		if (octet >= 16 && octet <= 31) {
			return true;
		}
	}
	return false;
}

function supportsPublicWebhook(origin: string) {
	try {
		const parsed = new URL(origin);
		// GitHub must be able to reach the hook over the public internet.
		if (isPrivateOrLocalHostname(parsed.hostname)) {
			return false;
		}
		if (parsed.protocol !== "https:") {
			return false;
		}
		return true;
	} catch {
		return false;
	}
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
	const webhookCapable = supportsPublicWebhook(appUrl);
	const state = await signGitHubManifestState({
		userId,
		redirectTo,
		providerName,
		providerOwner,
	});

	const manifest: Record<string, unknown> = {
		name: providerName,
		url: appUrl,
		redirect_url: `${appUrl}/api/github/app/manifest/callback`,
		callback_urls: [`${appUrl}/api/github/callback`],
		setup_url: `${appUrl}/api/github/callback?redirectTo=${encodeURIComponent(redirectTo)}`,
		setup_on_update: true,
		public: false,
		request_oauth_on_install: true,
		default_permissions: {
			contents: "read",
			metadata: "read",
			emails: "read",
			pull_requests: "write",
		},
		default_events: webhookCapable ? ["push", "pull_request"] : [],
	};
	if (webhookCapable) {
		manifest.hook_attributes = {
			url: `${appUrl}/api/github/webhook`,
		};
	}

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
