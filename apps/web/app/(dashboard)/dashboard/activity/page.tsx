import {
	clearAllActivityEventsAction,
	deleteActivityEventsAction,
} from "@/app/(dashboard)/actions";
import { EventLogWorkspace, type UnifiedEvent } from "@/components/event-log-workspace";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { listDeployments, listRuntimeActions } from "@/lib/platform";
import { getServerSession } from "@/lib/session";

function mapDeploymentSeverity(status: string): "info" | "success" | "warning" | "error" {
	if (status === "succeeded") return "success";
	if (status === "failed") return "error";
	if (status === "running" || status === "queued") return "info";
	return "warning";
}

function summarizeResourceName(details: Record<string, unknown>) {
	const direct =
		details.containerName ||
		details.stackName ||
		details.projectName ||
		details.volumeName ||
		details.networkName ||
		details.imageRef ||
		details.environmentName ||
		details.environmentId ||
		details.repository;
	if (typeof direct === "string" && direct.trim()) {
		return direct.trim();
	}

	const listValue =
		details.volumeNames || details.networkNames || details.imageRefs || details.configFiles;
	if (Array.isArray(listValue) && listValue.length) {
		const first = String(listValue[0] || "").trim();
		return listValue.length > 1 ? `${first} +${listValue.length - 1} more` : first;
	}

	return null;
}

export default async function ActivityPage({
	searchParams,
}: {
	searchParams: Promise<{ q?: string; severity?: string }>;
}) {
	const session = await getServerSession();

	if (!session?.user.id) {
		return null;
	}

	const params = await searchParams;
	const query = (params.q || "").toLowerCase();
	const severity = (params.severity || "all").toLowerCase();

	const [deployments, runtimeActions] = await Promise.all([
		listDeployments(session.user.id, 100),
		listRuntimeActions(session.user.id, 500),
	]);

	// Build unified timeline
	const deploymentEvents: UnifiedEvent[] = deployments.map((d) => ({
		id: d.id,
		kind: "deployment",
		severity: mapDeploymentSeverity(d.status),
		actionType: `deploy.${d.operation}`,
		resourceName: d.stackName || d.stack?.name || null,
		environmentName: d.environmentName || d.environment?.name || null,
		userName: d.initiatedBy?.name || null,
		source: null,
		containerId: null,
		details: d.summary || null,
		log: d.log || null,
		status: d.status,
		timestamp: d.createdAt.toISOString(),
		meta: {
			Operation: d.operation,
			Version: d.version,
			...(d.sourceCommitSha ? { Commit: d.sourceCommitSha.slice(0, 8) } : {}),
		},
	}));

	const runtimeEvents: UnifiedEvent[] = runtimeActions.map((e) => {
		let resourceName: string | null = null;
		try {
			if (e.details) {
				const parsed = JSON.parse(e.details);
				resourceName = summarizeResourceName(parsed);
			}
		} catch {
			/* ignore parse errors */
		}

		return {
			id: e.id,
			kind: "runtime",
			severity: e.status as "info" | "success" | "warning" | "error",
			actionType: e.actionType,
			resourceName,
			environmentName: e.environment?.name || null,
			userName: e.actor?.name || null,
			source: e.source,
			containerId: e.containerId,
			details: e.details,
			log: null,
			status: e.status,
			timestamp: e.occurredAt.toISOString(),
			meta: {
				...(e.source ? { Source: e.source } : {}),
			},
		};
	});

	// Merge and sort by time descending
	const allEvents = [...deploymentEvents, ...runtimeEvents].sort(
		(a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
	);

	// Apply filters
	const filtered = allEvents.filter((event) => {
		const matchesQuery =
			!query ||
			event.actionType.toLowerCase().includes(query) ||
			(event.resourceName || "").toLowerCase().includes(query) ||
			(event.environmentName || "").toLowerCase().includes(query) ||
			(event.containerId || "").toLowerCase().includes(query) ||
			(event.details || "").toLowerCase().includes(query) ||
			(event.userName || "").toLowerCase().includes(query) ||
			(event.source || "").toLowerCase().includes(query);
		const matchesSeverity = severity === "all" || event.severity === severity;
		return matchesQuery && matchesSeverity;
	});

	const totalCount = deployments.length + runtimeActions.length;

	return (
		<div className="animate-in space-y-5">
			<PageHeader
				title="Activity"
				description={`${totalCount} events · ${deployments.length} deployments · ${runtimeActions.length} runtime actions`}
			/>

			<Panel>
				<form className="flex items-center gap-2 border-b border-default/8 px-3 py-2">
					<Input
						type="search"
						name="q"
						defaultValue={params.q || ""}
						placeholder="Search events..."
						className="flex-1"
					/>
					<Select name="severity" defaultValue={severity} className="w-32 h-7 text-xs">
						<option value="all">All</option>
						<option value="info">Info</option>
						<option value="success">Success</option>
						<option value="warning">Warning</option>
						<option value="error">Error</option>
					</Select>
					<button type="submit" className="text-xs font-medium text-accent hover:text-accent/80">
						Filter
					</button>
				</form>

				<EventLogWorkspace
					events={filtered}
					deleteAction={deleteActivityEventsAction}
					clearAllAction={clearAllActivityEventsAction}
				/>
			</Panel>
		</div>
	);
}
