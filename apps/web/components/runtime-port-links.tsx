"use client";

import { ExternalLink } from "lucide-react";

type PublishedPort = {
	host: string;
	hostPort: string;
	containerPort: string;
	protocol: string;
	href: string | null;
	label: string;
	description: string;
};

const browserFriendlyPorts = new Set([
	80, 81, 3000, 3001, 4173, 4200, 4321, 5000, 5173, 5174, 5601, 6006, 7000, 7080, 8000, 8080, 8081,
	8088, 8089, 8181, 8443, 8888, 9000, 9090, 9091,
]);

function normalizeHost(host: string) {
	const stripped = host.replaceAll("[", "").replaceAll("]", "");
	if (!stripped || stripped === "0.0.0.0" || stripped === "::") {
		return "localhost";
	}

	return stripped;
}

function buildBrowserHref(host: string, hostPort: string, protocol: string) {
	if (protocol !== "tcp") {
		return null;
	}

	const numericPort = Number(hostPort);
	if (!Number.isFinite(numericPort)) {
		return null;
	}

	const scheme =
		numericPort === 443 || numericPort === 8443
			? "https"
			: browserFriendlyPorts.has(numericPort)
				? "http"
				: null;

	if (!scheme) {
		return null;
	}

	return `${scheme}://${normalizeHost(host)}:${hostPort}`;
}

function parseHostBinding(binding: string) {
	const bracketMatch = binding.match(/^\[([^\]]+)\]:(\d+)$/);
	if (bracketMatch) {
		return {
			host: bracketMatch[1],
			hostPort: bracketMatch[2],
		};
	}

	const regularMatch = binding.match(/^(.+):(\d+)$/);
	if (regularMatch) {
		return {
			host: regularMatch[1],
			hostPort: regularMatch[2],
		};
	}

	return null;
}

export function parsePublishedPorts(rawPorts?: string | null) {
	if (!rawPorts) {
		return [];
	}

	const seen = new Set<string>();
	const parsed: PublishedPort[] = [];

	for (const segment of rawPorts
		.split(",")
		.map((value) => value.trim())
		.filter(Boolean)) {
		if (!segment.includes("->")) {
			continue;
		}

		const [binding, exposed] = segment.split("->");
		const hostBinding = parseHostBinding(binding.trim());
		const exposedMatch = exposed?.trim().match(/^(\d+)\/([a-z0-9]+)$/i);

		if (!hostBinding || !exposedMatch) {
			continue;
		}

		const containerPort = exposedMatch[1];
		const protocol = exposedMatch[2].toLowerCase();
		const href = buildBrowserHref(hostBinding.host, hostBinding.hostPort, protocol);
		const dedupeKey = `${normalizeHost(hostBinding.host)}:${hostBinding.hostPort}:${containerPort}:${protocol}`;

		if (seen.has(dedupeKey)) {
			continue;
		}

		seen.add(dedupeKey);
		parsed.push({
			host: hostBinding.host,
			hostPort: hostBinding.hostPort,
			containerPort,
			protocol,
			href,
			label: `${hostBinding.hostPort}:${containerPort}`,
			description: `${normalizeHost(hostBinding.host)}:${hostBinding.hostPort} -> ${containerPort}/${protocol}`,
		});
	}

	return parsed;
}

export function RuntimePortLinks({
	ports,
	compact = false,
}: {
	ports?: string | null;
	compact?: boolean;
}) {
	const publishedPorts = parsePublishedPorts(ports);

	if (!publishedPorts.length) {
		return <span className="text-muted">—</span>;
	}

	return (
		<div className={`flex flex-wrap gap-2 ${compact ? "max-w-[280px]" : ""}`}>
			{publishedPorts.map((port) =>
				port.href ? (
					<a
						key={`${port.host}-${port.hostPort}-${port.containerPort}`}
						href={port.href}
						target="_blank"
						rel="noreferrer"
						title={`Open ${port.description}`}
						className="inline-flex items-center gap-1 rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent transition-colors hover:border-accent/35 hover:bg-accent/15"
					>
						{port.label}
						<ExternalLink className="h-3 w-3" />
					</a>
				) : (
					<span
						key={`${port.host}-${port.hostPort}-${port.containerPort}`}
						title={port.description}
						className="inline-flex items-center rounded-full border border-default/20 bg-background/70 px-2.5 py-1 text-xs font-medium text-muted"
					>
						{port.label}
					</span>
				),
			)}
		</div>
	);
}
