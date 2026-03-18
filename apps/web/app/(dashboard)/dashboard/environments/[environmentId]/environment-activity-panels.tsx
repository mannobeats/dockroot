import { StatusBadge } from "@/components/status-badge";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/panel";

export function EnvironmentActivityPanels({
	stacks,
	deployments,
}: {
	stacks: Array<{
		id: string;
		name: string;
		description: string | null;
		slug: string;
		status: string;
	}>;
	deployments: Array<{
		id: string;
		stackName: string | null;
		stack?: { name?: string | null } | null;
		status: string;
		version: string;
	}>;
}) {
	return (
		<div className="grid gap-4 xl:grid-cols-2">
			<Panel>
				<PanelHeader>
					<PanelTitle>Stacks ({stacks.length})</PanelTitle>
				</PanelHeader>
				{stacks.length ? (
					<div className="divide-y divide-default/5">
						{stacks.map((stack) => (
							<div key={stack.id} className="flex items-center justify-between px-3 py-2.5">
								<div>
									<p className="text-sm font-medium">{stack.name}</p>
									<p className="text-[11px] text-muted">{stack.description || stack.slug}</p>
								</div>
								<StatusBadge status={stack.status} />
							</div>
						))}
					</div>
				) : (
					<div className="p-6 text-center text-sm text-muted">No stacks assigned yet.</div>
				)}
			</Panel>

			<Panel>
				<PanelHeader>
					<PanelTitle>Recent deployments ({deployments.length})</PanelTitle>
				</PanelHeader>
				{deployments.length ? (
					<div className="divide-y divide-default/5">
						{deployments.map((deployment) => (
							<div key={deployment.id} className="px-3 py-2.5">
								<div className="flex items-center justify-between gap-3">
									<p className="text-sm font-medium">
										{deployment.stackName || deployment.stack?.name || "Deleted stack"}
									</p>
									<StatusBadge status={deployment.status} />
								</div>
								<p className="mt-0.5 font-mono text-[11px] text-muted">{deployment.version}</p>
							</div>
						))}
					</div>
				) : (
					<div className="p-6 text-center text-sm text-muted">No deployments yet.</div>
				)}
			</Panel>
		</div>
	);
}
