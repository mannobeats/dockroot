const sensitiveEnvPattern =
	/(SECRET|TOKEN|PASSWORD|KEY|PRIVATE|COOKIE|SESSION|AUTH|DATABASE_URL|CONNECTION_STRING)/i;

export function redactEnvVars(envVars: string[]) {
	return envVars.map((entry) => {
		const separatorIndex = entry.indexOf("=");
		if (separatorIndex === -1) {
			return entry;
		}

		const key = entry.slice(0, separatorIndex);
		const value = entry.slice(separatorIndex + 1);

		if (!sensitiveEnvPattern.test(key)) {
			return `${key}=${value}`;
		}

		if (!value) {
			return `${key}=`;
		}

		const preview =
			value.length <= 8 ? "*".repeat(value.length) : `${value.slice(0, 2)}***${value.slice(-2)}`;
		return `${key}=${preview}`;
	});
}

export function serializeContainerLabels(labels: Record<string, string>) {
	return Object.entries(labels)
		.map(([key, value]) => `${key}=${value}`)
		.join(",");
}

export function buildPublishedPortSummary(
	networkPorts: Record<string, Array<{ HostIp?: string; HostPort?: string }> | null>,
) {
	const publishedPorts = Object.entries(networkPorts)
		.flatMap(([containerPort, bindings]) =>
			(bindings || []).map((binding) => ({
				containerPort,
				hostIp: binding.HostIp || "localhost",
				hostPort: binding.HostPort || "",
			})),
		)
		.filter((binding) => binding.hostPort);

	return publishedPorts
		.map((binding) => `${binding.hostIp}:${binding.hostPort}->${binding.containerPort}`)
		.join(", ");
}

export function mapContainerBrowserState(browser: {
	kind: string;
	path: string;
	entries?: Array<{ name?: unknown; kind?: unknown }>;
	content?: string;
}) {
	if (browser.kind === "directory") {
		return {
			kind: "directory" as const,
			path: browser.path,
			entries: (browser.entries || []).map((entry) => {
				const kind: "file" | "dir" | "other" =
					entry.kind === "file" || entry.kind === "dir" || entry.kind === "other"
						? entry.kind
						: "other";
				return {
					name: typeof entry.name === "string" ? entry.name : "",
					kind,
				};
			}),
		};
	}

	if (browser.kind === "file") {
		return { kind: "file" as const, path: browser.path, content: browser.content || "" };
	}

	return { kind: "missing" as const, path: browser.path };
}
