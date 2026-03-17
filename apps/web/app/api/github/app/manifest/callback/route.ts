import crypto from "node:crypto";
import { db, user } from "@dockroot/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { sanitizeInternalRedirectPath } from "@/lib/authorization";
import {
	exchangeGitHubManifestCode,
	upsertGitHubProviderFromManifest,
	verifyGitHubAppState,
} from "@/lib/github-app";

export async function GET(request: Request) {
	const url = new URL(request.url);
	const code = url.searchParams.get("code");
	const state = url.searchParams.get("state");
	const redirectWithStatus = (
		status: string,
		redirectTo?: string | null,
		errorMessage?: string | null,
	) => {
		const targetPath = sanitizeInternalRedirectPath(redirectTo || "/dashboard/settings/github");
		const target = new URL(targetPath, request.url);
		target.searchParams.set("github", status);
		if (errorMessage) {
			target.searchParams.set("githubError", errorMessage.slice(0, 220));
		}
		return target;
	};

	if (!code || !state) {
		return NextResponse.redirect(redirectWithStatus("manifest-missing"));
	}

	try {
		const parsedState = verifyGitHubAppState(state);
		const actor = await db.query.user.findFirst({
			where: eq(user.id, parsedState.userId),
			columns: {
				id: true,
				role: true,
			},
		});
		if (!actor || !["owner", "admin"].includes(actor.role)) {
			return NextResponse.redirect(redirectWithStatus("manifest-denied", parsedState.redirectTo));
		}

		const converted = await exchangeGitHubManifestCode(code);
		const webhookSecret = converted.webhook_secret?.trim()
			? converted.webhook_secret
			: crypto.randomBytes(24).toString("hex");
		await upsertGitHubProviderFromManifest({
			userId: actor.id,
			name: parsedState.providerName?.trim() || converted.slug || "GitHub App",
			appId: String(converted.id),
			slug: converted.slug,
			privateKey: converted.pem,
			webhookSecret,
			clientId: converted.client_id || null,
			clientSecret: converted.client_secret || null,
		});

		return NextResponse.redirect(redirectWithStatus("manifest-ready", parsedState.redirectTo));
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown manifest callback error.";
		console.error("[github-manifest-callback] failed:", message);
		return NextResponse.redirect(redirectWithStatus("manifest-error", null, message));
	}
}
