import { db, githubInstallations } from "@dockroot/db";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
	getInstallationProviderConfigByInternalInstallationId,
	listRepositoryTreePaths,
} from "@/lib/github-app";
import { getServerSession } from "@/lib/session";

const COMPOSE_FILE_PATTERNS = [
	"compose.yaml",
	"compose.yml",
	"docker-compose.yaml",
	"docker-compose.yml",
];

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

	if (!installationId || !owner || !repository || !branch) {
		return NextResponse.json(
			{ error: "installationId, owner, repository, and branch are required." },
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
		const tree = await listRepositoryTreePaths({
			installationId: installation.githubInstallationId,
			owner,
			repository,
			branch,
			provider:
				(await getInstallationProviderConfigByInternalInstallationId(installation.id)) || undefined,
		});

		const suggestions = tree
			.filter((entry) => entry.type === "blob")
			.map((entry) => entry.path)
			.filter((path) => COMPOSE_FILE_PATTERNS.some((pattern) => path.endsWith(pattern)))
			.sort((left, right) => left.localeCompare(right))
			.slice(0, 20);

		return NextResponse.json({ suggestions });
	} catch (error) {
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Unable to inspect repository tree.",
			},
			{ status: 500 },
		);
	}
}
