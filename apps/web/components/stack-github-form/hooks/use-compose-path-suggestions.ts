"use client";

import { useEffect, useState } from "react";
import type { InstallationRepository } from "@/components/github-types";

export function useComposePathSuggestions({
	branch,
	composePath,
	installationId,
	selectedRepository,
	onDefaultComposePath,
}: {
	branch: string;
	composePath: string;
	installationId: string;
	selectedRepository?: InstallationRepository;
	onDefaultComposePath: (path: string) => void;
}) {
	const [pathSuggestions, setPathSuggestions] = useState<string[]>([]);

	useEffect(() => {
		if (!selectedRepository || !installationId || !branch) {
			setPathSuggestions([]);
			return;
		}

		let cancelled = false;

		void (async () => {
			try {
				const params = new URLSearchParams({
					installationId,
					owner: selectedRepository.owner.login,
					repository: selectedRepository.name,
					branch,
				});
				const response = await fetch(`/api/github/compose-paths?${params.toString()}`, {
					cache: "no-store",
				});
				const payload = (await response.json()) as {
					suggestions?: string[];
				};

				if (!cancelled && response.ok) {
					const suggestions = payload.suggestions || [];
					setPathSuggestions(suggestions);
					if (!composePath && suggestions[0]) {
						onDefaultComposePath(suggestions[0]);
					}
				}
			} catch {
				if (!cancelled) {
					setPathSuggestions([]);
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [branch, composePath, installationId, onDefaultComposePath, selectedRepository]);

	return pathSuggestions;
}
