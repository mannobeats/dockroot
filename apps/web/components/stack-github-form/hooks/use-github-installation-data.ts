"use client";

import { useCallback, useEffect, useState } from "react";
import type { GitHubProviderOption, InstallationOption } from "@/components/github-types";

export function useGitHubInstallationData(input: {
	appConfigured: boolean;
	installations: InstallationOption[];
	providers: GitHubProviderOption[];
}) {
	const [installationOptions, setInstallationOptions] = useState(input.installations);
	const [providerOptions, setProviderOptions] = useState(input.providers);
	const [installationId, setInstallationId] = useState(input.installations[0]?.id || "");
	const [installationStateMessage, setInstallationStateMessage] = useState("");

	const refreshInstallations = useCallback(async () => {
		if (!input.appConfigured) {
			return;
		}

		setInstallationStateMessage("");

		try {
			const response = await fetch("/api/github/installations", {
				cache: "no-store",
			});
			const payload = (await response.json()) as {
				error?: string;
				installations?: InstallationOption[];
			};

			if (!response.ok) {
				throw new Error(payload.error || "Unable to refresh GitHub installations.");
			}

			const nextInstallations = payload.installations || [];
			setInstallationOptions(nextInstallations);
			setInstallationId((current) => {
				if (current && nextInstallations.some((installation) => installation.id === current)) {
					return current;
				}
				return nextInstallations[0]?.id || "";
			});
			setInstallationStateMessage(
				nextInstallations.length
					? "GitHub access refreshed."
					: "No GitHub App installations connected yet.",
			);
		} catch (error) {
			setInstallationStateMessage(
				error instanceof Error ? error.message : "Unable to refresh GitHub installations.",
			);
		}
	}, [input.appConfigured]);

	const refreshProviders = useCallback(async () => {
		if (!input.appConfigured) {
			return;
		}

		try {
			const response = await fetch("/api/github/providers", {
				cache: "no-store",
			});
			const payload = (await response.json()) as {
				error?: string;
				providers?: GitHubProviderOption[];
			};
			if (!response.ok) {
				throw new Error(payload.error || "Unable to refresh GitHub Apps.");
			}

			const nextProviders = payload.providers || [];
			setProviderOptions(nextProviders);
		} catch {
			// keep existing provider state on transient failures
		}
	}, [input.appConfigured]);

	useEffect(() => {
		setInstallationOptions(input.installations);
		setInstallationId((current) => current || input.installations[0]?.id || "");
	}, [input.installations]);

	useEffect(() => {
		setProviderOptions(input.providers);
	}, [input.providers]);

	useEffect(() => {
		void refreshProviders();
		void refreshInstallations();
	}, [refreshInstallations, refreshProviders]);

	useEffect(() => {
		function refreshOnFocus() {
			void refreshProviders();
			void refreshInstallations();
		}

		window.addEventListener("focus", refreshOnFocus);
		document.addEventListener("visibilitychange", refreshOnFocus);

		return () => {
			window.removeEventListener("focus", refreshOnFocus);
			document.removeEventListener("visibilitychange", refreshOnFocus);
		};
	}, [refreshInstallations, refreshProviders]);

	return {
		installationOptions,
		providerOptions,
		installationId,
		setInstallationId,
		installationStateMessage,
	};
}
