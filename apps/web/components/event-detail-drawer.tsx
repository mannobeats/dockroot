"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { LogBlock } from "@/components/ui/log-block";

export type EventDetail = {
	id: string;
	kind: "deployment" | "runtime";
	title: string;
	status: string;
	severity: "info" | "success" | "warning" | "error";
	timestamp: string;
	environment: string | null;
	user: string | null;
	source: string | null;
	containerId: string | null;
	details: string | null;
	log: string | null;
	meta: Record<string, string | null>;
};

const severityVariant: Record<string, "accent" | "success" | "warning" | "danger" | "default"> = {
	info: "accent",
	success: "success",
	warning: "warning",
	error: "danger",
};

const detailLabelMap: Record<string, string> = {
	containerName: "Container Name",
	removeVolumes: "Remove Volumes",
	output: "Output",
	volumeName: "Volume Name",
	networkName: "Network Name",
	imageRef: "Image",
	stackName: "Stack Name",
	stackId: "Stack ID",
	projectName: "Compose Project",
	environmentId: "Environment ID",
	environmentName: "Environment",
	mode: "Mode",
	backupId: "Backup ID",
	fileName: "File Name",
	volumeNames: "Volume Names",
	networkNames: "Network Names",
	imageRefs: "Image References",
	configFiles: "Config Files",
	driver: "Driver",
	sourceType: "Source Type",
	repository: "Repository",
	branch: "Branch",
	composePath: "Compose Path",
	agentUrl: "Agent URL",
	description: "Description",
	sizeBytes: "Size (bytes)",
};

function parseDetails(raw: string | null): Array<{ label: string; value: string }> {
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		if (typeof parsed !== "object" || parsed === null) {
			return [{ label: "Details", value: raw }];
		}
		return Object.entries(parsed)
			.filter(([, v]) => v != null && v !== "" && v !== false)
			.map(([key, value]) => ({
				label:
					detailLabelMap[key] ||
					key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()),
				value: typeof value === "object" ? JSON.stringify(value) : String(value),
			}));
	} catch {
		return [{ label: "Details", value: raw }];
	}
}

export function EventDetailDrawer({
	event,
	open,
	onClose,
}: {
	event: EventDetail | null;
	open: boolean;
	onClose: () => void;
}) {
	const handleClose = useCallback(() => onClose(), [onClose]);
	const logRef = useRef<HTMLPreElement>(null);

	useEffect(() => {
		if (!open) return;
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				handleClose();
			}
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [open, handleClose]);

	// Auto-scroll log to bottom when drawer opens
	useEffect(() => {
		if (open && logRef.current) {
			requestAnimationFrame(() => {
				if (logRef.current) {
					logRef.current.scrollTop = logRef.current.scrollHeight;
				}
			});
		}
	}, [open]);

	if (!open || !event) return null;

	const metaEntries = Object.entries(event.meta).filter(([, v]) => v != null);
	const parsedDetails = parseDetails(event.details);

	return (
		<>
			<button
				type="button"
				onClick={handleClose}
				className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]"
				aria-label="Close detail panel"
			/>
			<div className="fixed inset-y-4 right-4 z-50 w-[min(44rem,92vw)] max-w-xl rounded-xl border border-default/12 bg-surface/95 shadow-[var(--shadow-lg)] backdrop-blur-sm animate-in flex flex-col">
				{/* Header */}
				<div className="flex items-center justify-between border-b border-default/10 px-4 py-3 shrink-0">
					<div className="min-w-0 flex-1">
						<p className="text-xs font-semibold uppercase tracking-wide text-muted/75">
							Event Detail
						</p>
						<div className="mt-1 flex items-center gap-2">
							<p className="truncate text-sm font-medium">{event.title}</p>
							<Badge variant={severityVariant[event.severity] || "default"}>{event.severity}</Badge>
						</div>
					</div>
					<button
						type="button"
						onClick={handleClose}
						className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
						aria-label="Close"
					>
						<X className="h-3.5 w-3.5" />
					</button>
				</div>

				{/* Body */}
				<div className="flex-1 overflow-y-auto p-4 space-y-5">
					{/* Properties grid */}
					<div className="grid grid-cols-2 gap-x-4 gap-y-3">
						<PropertyItem
							label="Type"
							value={event.kind === "deployment" ? "Deployment" : "Runtime Action"}
						/>
						<PropertyItem label="Status">
							<Badge variant={severityVariant[event.severity] || "default"}>{event.status}</Badge>
						</PropertyItem>
						<PropertyItem label="Time" value={new Date(event.timestamp).toLocaleString()} />
						<PropertyItem label="Environment" value={event.environment || "-"} />
						<PropertyItem label="User" value={event.user || "System"} />
						{event.source ? <PropertyItem label="Source" value={event.source} /> : null}
						{event.containerId ? (
							<PropertyItem label="Container" value={event.containerId.slice(0, 12)} mono />
						) : null}
						{metaEntries.map(([key, value]) => (
							<PropertyItem key={key} label={key} value={value || "-"} />
						))}
					</div>

					{/* Parsed details */}
					{parsedDetails.length > 0 ? (
						<div>
							<p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted/60">
								Details
							</p>
							<div className="rounded-lg border border-default/10 bg-surface-2 divide-y divide-default/8">
								{parsedDetails.map(({ label, value }) => (
									<div key={label} className="flex items-start gap-3 px-3 py-2">
										<span className="shrink-0 text-[11px] font-medium text-muted min-w-[120px]">
											{label}
										</span>
										<span className="text-xs text-foreground break-all font-mono">{value}</span>
									</div>
								))}
							</div>
						</div>
					) : null}

					{/* Log output */}
					{event.log ? (
						<div>
							<p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted/60">
								Log Output
							</p>
							<LogBlock ref={logRef} className="max-h-[55vh] p-3 overflow-y-auto">
								{event.log}
							</LogBlock>
						</div>
					) : null}
				</div>
			</div>
		</>
	);
}

function PropertyItem({
	label,
	value,
	mono,
	children,
}: {
	label: string;
	value?: string;
	mono?: boolean;
	children?: React.ReactNode;
}) {
	return (
		<div>
			<p className="text-[11px] font-semibold uppercase tracking-wide text-muted/60">{label}</p>
			{children ? (
				<div className="mt-1">{children}</div>
			) : (
				<p className={`mt-0.5 text-sm ${mono ? "font-mono text-xs" : ""}`}>{value}</p>
			)}
		</div>
	);
}
