import { NextResponse } from "next/server";
import { verifyGitHubWebhookSignature } from "@/lib/github-app";
import {
	disconnectGitHubInstallation,
	syncKnownGitHubInstallation,
	triggerGitHubPushDeploy,
} from "@/lib/platform";

export async function POST(request: Request) {
	const rawBody = await request.text();
	const signature = request.headers.get("x-hub-signature-256");
	const event = request.headers.get("x-github-event");
	const deliveryId = request.headers.get("x-github-delivery");

	const verification = await verifyGitHubWebhookSignature(rawBody, signature);
	if (!verification.valid) {
		return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
	}

	if (event === "installation" || event === "installation_repositories") {
		const payload = JSON.parse(rawBody) as {
			action?: string;
			installation?: { id: number };
		};
		if (payload.installation?.id) {
			if (payload.action === "deleted" || payload.action === "suspend") {
				await disconnectGitHubInstallation(
					String(payload.installation.id),
					verification.providerId || undefined,
				).catch(() => null);
			} else {
				await syncKnownGitHubInstallation(
					String(payload.installation.id),
					verification.providerId || undefined,
				).catch(() => null);
			}
		}
		return NextResponse.json({ ok: true });
	}

	if (event === "push") {
		const payload = JSON.parse(rawBody) as {
			installation?: { id: number };
			before?: string;
			after?: string;
			ref?: string;
			repository?: {
				name: string;
				owner?: { login: string };
			};
			commits?: Array<{
				added?: string[];
				modified?: string[];
				removed?: string[];
			}>;
		};

		if (
			payload.installation?.id &&
			payload.ref &&
			payload.repository?.owner?.login &&
			payload.repository.name
		) {
			const changedPaths = (payload.commits || []).flatMap((commit) => [
				...(commit.added || []),
				...(commit.modified || []),
				...(commit.removed || []),
			]);
			await triggerGitHubPushDeploy({
				githubInstallationId: String(payload.installation.id),
				owner: payload.repository.owner.login,
				repository: payload.repository.name,
				branch: payload.ref.replace("refs/heads/", ""),
				before: payload.before || null,
				after: payload.after || null,
				deliveryId,
				changedPaths,
				providerId: verification.providerId || undefined,
			});
		}
	}

	return NextResponse.json({ ok: true });
}
