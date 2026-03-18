type RecentDeployment = {
	id: string;
	status: string;
	version?: string | null;
	stackName?: string | null;
	environmentId?: string | null;
	environmentName?: string | null;
	createdAt: Date;
	stack?: {
		id: string;
		name: string;
	} | null;
	environment?: {
		id: string;
		name: string;
	} | null;
};

type CollectorHealthRow = {
	name: string;
	status: string;
	lastError: string;
};

export function getDashboardGreeting(now = new Date()) {
	const hour = now.getHours();
	if (hour < 12) return "Good morning";
	if (hour < 17) return "Good afternoon";
	return "Good evening";
}

export function buildDeploymentStatus(
	recentDeployments: RecentDeployment[],
	environmentId: string,
) {
	return recentDeployments
		.filter(
			(deployment) =>
				deployment.environment?.id === environmentId || deployment.environmentId === environmentId,
		)
		.reduce<Array<{ label: string; value: number }>>((acc, deployment) => {
			const entry = acc.find((item) => item.label === deployment.status);
			if (entry) {
				entry.value += 1;
			} else {
				acc.push({ label: deployment.status, value: 1 });
			}
			return acc;
		}, []);
}

export function buildAttentionItems(input: {
	recentDeployments: RecentDeployment[];
	collectorHealth: CollectorHealthRow[] | null;
	environmentStatus: string;
}) {
	const deploymentAlerts = input.recentDeployments.filter((deployment) =>
		["failed", "queued", "deploying"].includes(deployment.status),
	);
	const collectorAlerts = (input.collectorHealth || []).filter(
		(collector) => collector.status !== "healthy",
	);
	const environmentAlerts = ["degraded", "offline"].includes(input.environmentStatus)
		? [{ label: input.environmentStatus, value: 1 }]
		: [];

	return [
		...deploymentAlerts.slice(0, 3).map((deployment) => ({
			id: deployment.id,
			title: deployment.stackName || deployment.stack?.name || "Unknown stack",
			detail: `${deployment.status} · ${deployment.environmentName || deployment.environment?.name || "Unknown"}`,
			status: deployment.status,
		})),
		...collectorAlerts.slice(0, 2).map((collector) => ({
			id: collector.name,
			title: collector.name,
			detail: collector.lastError || "Monitoring collector needs attention",
			status: collector.status,
		})),
		...environmentAlerts.slice(0, 2).map((entry) => ({
			id: entry.label,
			title: `${entry.value} environment${entry.value === 1 ? "" : "s"}`,
			detail: `${entry.label} status detected`,
			status: entry.label,
		})),
	].slice(0, 4);
}

export function serializeRecentDeployments(recentDeployments: RecentDeployment[]) {
	return recentDeployments.map((deployment) => ({
		id: deployment.id,
		status: deployment.status,
		version: deployment.version || "",
		createdAt: deployment.createdAt.toISOString(),
		stack: deployment.stack
			? { id: deployment.stack.id, name: deployment.stack.name }
			: { id: "", name: deployment.stackName || "Deleted stack" },
		environment: deployment.environment
			? { id: deployment.environment.id, name: deployment.environment.name }
			: { id: "", name: deployment.environmentName || "Deleted environment" },
	}));
}
