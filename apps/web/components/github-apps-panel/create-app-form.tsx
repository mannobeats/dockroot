"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function GitHubCreateAppForm({
	manifestName,
	manifestOwner,
	manifestError,
	onManifestNameChange,
	onManifestOwnerChange,
	onSubmit,
}: {
	manifestName: string;
	manifestOwner: string;
	manifestError: string;
	onManifestNameChange: (value: string) => void;
	onManifestOwnerChange: (value: string) => void;
	onSubmit: () => void;
}) {
	return (
		<div className="space-y-3">
			<div className="grid gap-3 sm:grid-cols-2">
				<label htmlFor="github-app-name" className="grid gap-1">
					<span className="text-xs font-medium">App name</span>
					<Input
						id="github-app-name"
						value={manifestName}
						onChange={(event) => onManifestNameChange(event.target.value)}
						placeholder="Dockroot GitHub App"
						inputSize="sm"
					/>
				</label>
				<label htmlFor="github-app-owner" className="grid gap-1">
					<span className="text-xs font-medium">Organization (optional)</span>
					<Input
						id="github-app-owner"
						value={manifestOwner}
						onChange={(event) => onManifestOwnerChange(event.target.value)}
						placeholder="my-org"
						inputSize="sm"
					/>
				</label>
			</div>
			{manifestError ? <p className="text-xs text-danger">{manifestError}</p> : null}
			<Button size="sm" onClick={onSubmit}>
				<Plus className="h-3.5 w-3.5" />
				Create GitHub App
			</Button>
		</div>
	);
}
