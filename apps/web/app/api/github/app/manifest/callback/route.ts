import { NextResponse } from "next/server";
import { requirePrivilegedSession, sanitizeInternalRedirectPath } from "@/lib/authorization";
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
	const redirectWithStatus = (status: string, redirectTo?: string | null) => {
		const targetPath = sanitizeInternalRedirectPath(redirectTo || "/dashboard/stacks");
		const target = new URL(targetPath, request.url);
		target.searchParams.set("github", status);
		return target;
	};

	if (!code || !state) {
		return NextResponse.redirect(redirectWithStatus("manifest-missing"));
	}

	try {
		const parsedState = verifyGitHubAppState(state);
		if (parsedState.userId !== userId) {
			return NextResponse.redirect(redirectWithStatus("manifest-denied", parsedState.redirectTo));
		}

		const converted = await exchangeGitHubManifestCode(code);
		await upsertGitHubProviderFromManifest({
			userId,
			name: parsedState.providerName?.trim() || converted.slug || "GitHub App",
			appId: String(converted.id),
			slug: converted.slug,
			privateKey: converted.pem,
			webhookSecret: converted.webhook_secret,
			clientId: converted.client_id || null,
			clientSecret: converted.client_secret || null,
		});

		return NextResponse.redirect(redirectWithStatus("manifest-ready", parsedState.redirectTo));
	} catch {
		return NextResponse.redirect(redirectWithStatus("manifest-error"));
	}
}
