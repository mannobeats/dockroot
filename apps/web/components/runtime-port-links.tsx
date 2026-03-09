"use client";

import { ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type PublishedPort = {
	host: string;
	hostPort: string;
	containerPort: string;
	protocol: string;
	href: string | null;
	label: string;
	description: string;
};

function normalizeHost(host: string, preferredHost?: string | null) {
	const stripped = host.replaceAll("[", "").replaceAll("]", "");
	if (
		!stripped ||
		stripped === "0.0.0.0" ||
		stripped === "::" ||
		stripped === "::1" ||
		stripped === "localhost" ||
		stripped === "127.0.0.1"
	) {
		return preferredHost || "localhost";
	}

	return stripped;
}

function buildBrowserHref(
	host: string,
	hostPort: string,
	protocol: string,
	preferredHost?: string | null,
) {
	if (protocol !== "tcp") {
		return null;
	}

	const numericPort = Number(hostPort);
	if (!Number.isFinite(numericPort) || numericPort <= 0) {
		return null;
	}

	// Make all reasonable TCP ports clickable — only exclude well-known non-HTTP ports
	const nonHttpPorts = new Set([22, 25, 53, 110, 143, 389, 465, 587, 636, 993, 995]);
	if (nonHttpPorts.has(numericPort)) {
		return null;
	}

	const scheme = numericPort === 443 || numericPort === 8443 ? "https" : "http";
	return `${scheme}://${normalizeHost(host, preferredHost)}:${hostPort}`;
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

function managerHostFromUrl(managerUrl?: string | null) {
	if (!managerUrl) {
		return null;
	}

	try {
		return new URL(managerUrl).hostname;
	} catch {
		return null;
	}
}

export function parsePublishedPorts(rawPorts?: string | null, preferredHost?: string | null) {
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
		const href = buildBrowserHref(hostBinding.host, hostBinding.hostPort, protocol, preferredHost);
		const dedupeKey = `${normalizeHost(hostBinding.host, preferredHost)}:${hostBinding.hostPort}:${containerPort}:${protocol}`;

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
			description: `${normalizeHost(hostBinding.host, preferredHost)}:${hostBinding.hostPort} -> ${containerPort}/${protocol}`,
		});
	}

	return parsed;
}

export function RuntimePortLinks({
	ports,
	compact = false,
	managerUrl,
}: {
	ports?: string | null;
	compact?: boolean;
	managerUrl?: string | null;
}) {
	const [browserHost, setBrowserHost] = useState<string | null>(null);

	useEffect(() => {
		setBrowserHost(window.location.hostname);
	}, []);

	const preferredHost = managerHostFromUrl(managerUrl) || browserHost;
	const publishedPorts = useMemo(
		() => parsePublishedPorts(ports, preferredHost),
		[ports, preferredHost],
	);

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
