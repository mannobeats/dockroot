import { NextResponse } from "next/server";
import { verifyGitHubWebhookSignature } from "@/lib/github-app";
import { triggerGitHubPushDeploy } from "@/lib/platform";

export async function POST(request: Request) {
	const rawBody = await request.text();
	const signature = request.headers.get("x-hub-signature-256");
	const event = request.headers.get("x-github-event");

	if (!verifyGitHubWebhookSignature(rawBody, signature)) {
		return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
	}

	if (event === "push") {
		const payload = JSON.parse(rawBody) as {
			installation?: { id: number };
			ref?: string;
			repository?: {
				name: string;
				owner?: { login: string };
			};
		};

		if (
			payload.installation?.id &&
			payload.ref &&
			payload.repository?.owner?.login &&
			payload.repository.name
		) {
			await triggerGitHubPushDeploy({
				githubInstallationId: String(payload.installation.id),
				owner: payload.repository.owner.login,
				repository: payload.repository.name,
				branch: payload.ref.replace("refs/heads/", ""),
			});
		}
	}

	return NextResponse.json({ ok: true });
}
