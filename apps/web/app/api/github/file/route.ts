import { db, githubInstallations } from "@dockroot/db";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
	fetchRepositoryTextFile,
	getInstallationProviderConfigByInternalInstallationId,
	getRepositoryBranchHeadSha,
} from "@/lib/github-app";
import { getServerSession } from "@/lib/session";

export async function GET(request: Request) {
	const session = await getServerSession();
	if (!session?.user.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const url = new URL(request.url);
	const installationId = url.searchParams.get("installationId");
	const owner = url.searchParams.get("owner");
	const repository = url.searchParams.get("repository");
	const branch = url.searchParams.get("branch");
	const composePath = url.searchParams.get("composePath");
	const envPath = url.searchParams.get("envPath");

	if (!installationId || !owner || !repository || !branch || !composePath) {
		return NextResponse.json(
			{ error: "installationId, owner, repository, branch, and composePath are required." },
			{ status: 400 },
		);
	}

	const installation = await db.query.githubInstallations.findFirst({
		where: and(
			eq(githubInstallations.id, installationId),
			eq(githubInstallations.createdByUserId, session.user.id),
		),
	});

	if (!installation) {
		return NextResponse.json({ error: "GitHub installation not found." }, { status: 404 });
	}

	try {
		const compose = await fetchRepositoryTextFile({
			installationId: installation.githubInstallationId,
			owner,
			repository,
			path: composePath,
			ref: branch,
			provider:
				(await getInstallationProviderConfigByInternalInstallationId(installation.id)) || undefined,
		});
		const envFile = envPath
			? await fetchRepositoryTextFile({
					installationId: installation.githubInstallationId,
					owner,
					repository,
					path: envPath,
					ref: branch,
					provider:
						(await getInstallationProviderConfigByInternalInstallationId(installation.id)) ||
						undefined,
				})
			: null;
		const headSha = await getRepositoryBranchHeadSha({
			installationId: installation.githubInstallationId,
			owner,
			repository,
			branch,
			provider:
				(await getInstallationProviderConfigByInternalInstallationId(installation.id)) || undefined,
		});

		return NextResponse.json({
			composeYaml: compose.text,
			envFileContent: envFile?.text || "",
			headSha,
		});
	} catch (error) {
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Unable to load GitHub repository files.",
			},
			{ status: 500 },
		);
	}
}
