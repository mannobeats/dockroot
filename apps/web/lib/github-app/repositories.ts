import type { GitHubProviderConfig } from "@/lib/github-app-provider";
import { GITHUB_API_BASE, githubRequest } from "./client";
import { createInstallationAccessToken } from "./installations";

export async function fetchRepositoryTextFile(input: {
	installationId: string;
	owner: string;
	repository: string;
	path: string;
	ref?: string | null;
	provider?: GitHubProviderConfig;
}) {
	const token = await createInstallationAccessToken(input.installationId, input.provider);
	const refQuery = input.ref ? `?ref=${encodeURIComponent(input.ref)}` : "";
	const response = await githubRequest<{
		content: string;
		encoding: string;
		sha: string;
	}>(`/repos/${input.owner}/${input.repository}/contents/${input.path}${refQuery}`, {
		token: token.token,
	});

	if (response.encoding !== "base64") {
		throw new Error(`Unsupported GitHub content encoding: ${response.encoding}`);
	}

	return {
		text: Buffer.from(response.content.replace(/\n/g, ""), "base64").toString("utf8"),
		sha: response.sha,
	};
}

export async function downloadRepositoryTarball(input: {
	installationId: string;
	owner: string;
	repository: string;
	ref: string;
	provider?: GitHubProviderConfig;
}) {
	const token = await createInstallationAccessToken(input.installationId, input.provider);
	const response = await fetch(
		`${GITHUB_API_BASE}/repos/${input.owner}/${input.repository}/tarball/${encodeURIComponent(input.ref)}`,
		{
			headers: {
				Accept: "application/vnd.github+json",
				Authorization: `Bearer ${token.token}`,
				"X-GitHub-Api-Version": "2022-11-28",
				"User-Agent": "dockroot-manager",
			},
			redirect: "follow",
			cache: "no-store",
		},
	);

	if (!response.ok) {
		throw new Error(
			`GitHub archive download failed (${response.status} ${response.statusText}) for ${input.owner}/${input.repository}@${input.ref}`,
		);
	}

	const contentLength = Number(response.headers.get("content-length") || "0");
	const maxArchiveBytes = 250 * 1024 * 1024;
	if (contentLength > maxArchiveBytes) {
		throw new Error("GitHub source archive exceeds the 250 MB download limit.");
	}

	const archive = Buffer.from(await response.arrayBuffer());
	if (archive.byteLength > maxArchiveBytes) {
		throw new Error("GitHub source archive exceeds the 250 MB in-memory limit.");
	}

	return archive;
}

export async function getRepositoryBranchHeadSha(input: {
	installationId: string;
	owner: string;
	repository: string;
	branch: string;
	provider?: GitHubProviderConfig;
}) {
	const token = await createInstallationAccessToken(input.installationId, input.provider);
	const response = await githubRequest<{
		commit: {
			sha: string;
		};
	}>(`/repos/${input.owner}/${input.repository}/branches/${encodeURIComponent(input.branch)}`, {
		token: token.token,
	});

	return response.commit.sha;
}

export async function listRepositoryTreePaths(input: {
	installationId: string;
	owner: string;
	repository: string;
	branch: string;
	provider?: GitHubProviderConfig;
}) {
	const token = await createInstallationAccessToken(input.installationId, input.provider);
	const response = await githubRequest<{
		tree: Array<{
			path: string;
			type: string;
		}>;
	}>(
		`/repos/${input.owner}/${input.repository}/git/trees/${encodeURIComponent(input.branch)}?recursive=1`,
		{
			token: token.token,
		},
	);

	return response.tree;
}

export async function listChangedFilesForCompare(input: {
	installationId: string;
	owner: string;
	repository: string;
	base: string;
	head: string;
	provider?: GitHubProviderConfig;
}) {
	const token = await createInstallationAccessToken(input.installationId, input.provider);
	const response = await githubRequest<{
		files?: Array<{ filename: string }>;
	}>(
		`/repos/${input.owner}/${input.repository}/compare/${encodeURIComponent(input.base)}...${encodeURIComponent(input.head)}`,
		{ token: token.token },
	);

	return (response.files || []).map((file) => file.filename).filter(Boolean);
}
