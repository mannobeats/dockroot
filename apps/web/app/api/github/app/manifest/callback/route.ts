import { NextResponse } from "next/server";
import { requirePrivilegedSession } from "@/lib/authorization";
import {
	exchangeGitHubManifestCode,
	upsertGitHubProviderFromManifest,
	verifyGitHubAppState,
} from "@/lib/github-app";

export async function GET(request: Request) {
	let userId = "";
	try {
		const auth = await requirePrivilegedSession();
		userId = auth.userId;
	} catch {
		return NextResponse.redirect(new URL("/dashboard/stacks?github=forbidden", request.url));
	}

	const url = new URL(request.url);
	const code = url.searchParams.get("code");
	const state = url.searchParams.get("state");

	if (!code || !state) {
		return NextResponse.redirect(new URL("/dashboard/stacks?github=manifest-missing", request.url));
	}

	try {
		const parsedState = verifyGitHubAppState(state);
		if (parsedState.userId !== userId) {
			return NextResponse.redirect(
				new URL("/dashboard/stacks?github=manifest-denied", request.url),
			);
		}

		const converted = await exchangeGitHubManifestCode(code);
		await upsertGitHubProviderFromManifest({
			userId,
			name: "GitHub App",
			appId: String(converted.id),
			slug: converted.slug,
			privateKey: converted.pem,
			webhookSecret: converted.webhook_secret,
			clientId: converted.client_id || null,
			clientSecret: converted.client_secret || null,
		});

		return NextResponse.redirect(new URL("/dashboard/stacks?github=manifest-ready", request.url));
	} catch {
		return NextResponse.redirect(new URL("/dashboard/stacks?github=manifest-error", request.url));
	}
}
