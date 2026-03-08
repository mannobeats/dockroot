"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FormSubmitButton } from "@/components/form-submit-button";

interface InstallationRepository {
	id: number;
	name: string;
	full_name: string;
	private: boolean;
	default_branch: string;
	owner: {
		login: string;
	};
}

interface InstallationOption {
	id: string;
	accountLogin: string;
	accountType: string | null;
	repositories: InstallationRepository[];
	repositoryError?: string;
}

export function StackGitHubForm({
	projectId,
	environments,
	installations,
	redirectTo,
	appConfigured,
	action,
}: {
	projectId: string;
	environments: Array<{ id: string; name: string; kind: string }>;
	installations: InstallationOption[];
	redirectTo: string;
	appConfigured: boolean;
	action: (formData: FormData) => void | Promise<void>;
}) {
	const [installationId, setInstallationId] = useState(installations[0]?.id || "");
	const availableRepositories = useMemo(
		() =>
			installations.find((installation) => installation.id === installationId)?.repositories || [],
		[installationId, installations],
	);
	const [repositoryId, setRepositoryId] = useState(
		availableRepositories[0] ? String(availableRepositories[0].id) : "",
	);

	useEffect(() => {
		setRepositoryId(availableRepositories[0] ? String(availableRepositories[0].id) : "");
	}, [availableRepositories]);

	const selectedRepository = availableRepositories.find(
		(repository) => String(repository.id) === repositoryId,
	);

	if (!installations.length) {
		return (
			<div className="rounded-2xl border border-dashed border-default/20 bg-background/60 p-6">
				<p className="text-sm font-medium">
					{appConfigured
						? "No GitHub App installations connected yet."
						: "GitHub App environment variables are not configured yet."}
				</p>
				<p className="mt-2 text-sm text-muted">
					{appConfigured
						? "Install the GitHub App once, then you can deploy public or private repositories without pasting tokens."
						: "Set GITHUB_APP_ID, GITHUB_APP_SLUG, GITHUB_APP_PRIVATE_KEY, and GITHUB_APP_WEBHOOK_SECRET before connecting repositories."}
				</p>
				{appConfigured ? (
					<Link
						href={`/api/github/install?redirectTo=${encodeURIComponent(redirectTo)}`}
						className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-accent px-4 text-sm font-medium text-white transition-opacity hover:opacity-90"
					>
						Connect GitHub App
					</Link>
				) : null}
			</div>
		);
	}

	return (
		<form action={action} className="space-y-4">
			<input type="hidden" name="projectId" value={projectId} />
			<input type="hidden" name="owner" value={selectedRepository?.owner.login || ""} />
			<input type="hidden" name="repository" value={selectedRepository?.name || ""} />
			<div className="grid gap-4 xl:grid-cols-2">
				<div className="space-y-1.5">
					<label htmlFor="github-stack-name" className="text-sm font-medium">
						Stack name
					</label>
					<input
						id="github-stack-name"
						name="name"
						defaultValue={selectedRepository?.name || ""}
						placeholder="customer-portal"
						className="h-11 w-full rounded-xl border border-default/15 bg-background px-4 text-sm outline-none transition-colors focus:border-accent"
					/>
				</div>
				<div className="space-y-1.5">
					<label htmlFor="github-environment" className="text-sm font-medium">
						Target environment
					</label>
					<select
						id="github-environment"
						name="environmentId"
						required
						className="h-11 w-full rounded-xl border border-default/15 bg-background px-4 text-sm outline-none transition-colors focus:border-accent"
					>
						{environments.map((environment) => (
							<option key={environment.id} value={environment.id}>
								{environment.name} ({environment.kind})
							</option>
						))}
					</select>
				</div>
			</div>

			<div className="space-y-1.5">
				<label htmlFor="github-description" className="text-sm font-medium">
					Description
				</label>
				<input
					id="github-description"
					name="description"
					placeholder="Deploy from GitHub App with branch-based updates"
					className="h-11 w-full rounded-xl border border-default/15 bg-background px-4 text-sm outline-none transition-colors focus:border-accent"
				/>
			</div>

			<div className="grid gap-4 xl:grid-cols-2">
				<div className="space-y-1.5">
					<label htmlFor="installationId" className="text-sm font-medium">
						GitHub account
					</label>
					<select
						id="installationId"
						name="installationId"
						value={installationId}
						onChange={(event) => setInstallationId(event.target.value)}
						className="h-11 w-full rounded-xl border border-default/15 bg-background px-4 text-sm outline-none transition-colors focus:border-accent"
					>
						{installations.map((installation) => (
							<option key={installation.id} value={installation.id}>
								{installation.accountLogin}
								{installation.accountType ? ` (${installation.accountType})` : ""}
							</option>
						))}
					</select>
				</div>

				<div className="space-y-1.5">
					<label htmlFor="repositoryId" className="text-sm font-medium">
						Repository
					</label>
					<select
						id="repositoryId"
						name="repositoryId"
						value={repositoryId}
						onChange={(event) => setRepositoryId(event.target.value)}
						className="h-11 w-full rounded-xl border border-default/15 bg-background px-4 text-sm outline-none transition-colors focus:border-accent"
					>
						{availableRepositories.map((repository) => (
							<option key={repository.id} value={repository.id}>
								{repository.full_name}
								{repository.private ? " (private)" : ""}
							</option>
						))}
					</select>
				</div>
			</div>

			{installations.find((installation) => installation.id === installationId)?.repositoryError ? (
				<p className="text-sm text-danger">
					{
						installations.find((installation) => installation.id === installationId)
							?.repositoryError
					}
				</p>
			) : null}

			<div className="grid gap-4 xl:grid-cols-3">
				<div className="space-y-1.5">
					<label htmlFor="branch" className="text-sm font-medium">
						Branch
					</label>
					<input
						id="branch"
						name="branch"
						required
						defaultValue={selectedRepository?.default_branch || "main"}
						className="h-11 w-full rounded-xl border border-default/15 bg-background px-4 text-sm outline-none transition-colors focus:border-accent"
					/>
				</div>
				<div className="space-y-1.5 xl:col-span-2">
					<label htmlFor="composePath" className="text-sm font-medium">
						Compose file path
					</label>
					<input
						id="composePath"
						name="composePath"
						required
						defaultValue="compose.yaml"
						placeholder="deploy/compose.prod.yaml"
						className="h-11 w-full rounded-xl border border-default/15 bg-background px-4 text-sm outline-none transition-colors focus:border-accent"
					/>
				</div>
			</div>

			<div className="space-y-1.5">
				<label htmlFor="envPath" className="text-sm font-medium">
					Env file path
				</label>
				<input
					id="envPath"
					name="envPath"
					placeholder="deploy/.env.production"
					className="h-11 w-full rounded-xl border border-default/15 bg-background px-4 text-sm outline-none transition-colors focus:border-accent"
				/>
			</div>

			<div className="flex items-center justify-between rounded-2xl border border-default/15 bg-background/60 px-4 py-3 text-sm">
				<p className="text-muted">
					Deploys use short-lived GitHub App installation tokens. No PATs or SSH keys required.
				</p>
				<Link
					href={`/api/github/install?redirectTo=${encodeURIComponent(redirectTo)}`}
					className="text-sm font-medium text-accent"
				>
					Add another installation
				</Link>
			</div>

			<div className="flex justify-end">
				<FormSubmitButton label="Create GitHub stack" pendingLabel="Creating stack..." />
			</div>
		</form>
	);
}
