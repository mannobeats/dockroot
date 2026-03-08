import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { controlContainerAction } from "@/app/(dashboard)/actions";
import { ContainerMetricsPanel } from "@/components/container-metrics-panel";
import { FormSubmitButton } from "@/components/form-submit-button";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { getContainerDetails } from "@/lib/platform/docker";
import { getPrometheusContainerMetrics } from "@/lib/prometheus";

export default async function ContainerDetailPage({
	params,
}: {
	params: Promise<{ containerId: string }>;
}) {
	const { containerId } = await params;
	const [details, metrics] = await Promise.all([
		getContainerDetails(containerId),
		getPrometheusContainerMetrics(containerId),
	]);
	const inspect = details.inspect;

	if (!inspect) {
		return <div className="text-sm text-muted">Container not found.</div>;
	}

	return (
		<div className="space-y-6">
			<PageHeader
				kicker="Runtime"
				title={inspect.Name?.replace(/^\//, "") || containerId}
				description={inspect.Config?.Image || "Container details"}
				actions={
					<>
						<Link
							href="/dashboard/containers"
							className="inline-flex h-11 items-center justify-center rounded-xl border border-default/20 bg-surface px-4 text-sm font-medium transition-colors hover:border-accent/30 hover:text-accent"
						>
							<ArrowLeft className="mr-2 h-4 w-4" />
							Back
						</Link>
						{(["start", "stop", "restart"] as const).map((action) => (
							<form key={action} action={controlContainerAction}>
								<input type="hidden" name="containerId" value={containerId} />
								<input type="hidden" name="action" value={action} />
								<FormSubmitButton
									label={action}
									pendingLabel={`${action}ing...`}
									className="inline-flex h-11 items-center justify-center rounded-xl border border-default/20 bg-surface px-4 text-sm font-medium text-muted transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
								/>
							</form>
						))}
					</>
				}
			/>

			<ContainerMetricsPanel metrics={metrics} />

			<div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
				<section className="rounded-2xl border border-default/15 bg-surface p-5">
					<div className="flex items-center gap-2">
						<h2 className="text-lg font-semibold tracking-tight">Details</h2>
						<StatusBadge status={inspect.State?.Status || "offline"} />
					</div>
					<div className="mt-5 grid gap-3 sm:grid-cols-2">
						<div className="rounded-xl border border-default/15 bg-background/60 p-4">
							<p className="text-xs text-muted">Image</p>
							<p className="mt-2 text-sm font-medium">{inspect.Config?.Image}</p>
						</div>
						<div className="rounded-xl border border-default/15 bg-background/60 p-4">
							<p className="text-xs text-muted">Started at</p>
							<p className="mt-2 text-sm font-medium">{inspect.State?.StartedAt || "—"}</p>
						</div>
						<div className="rounded-xl border border-default/15 bg-background/60 p-4">
							<p className="text-xs text-muted">IP address</p>
							<p className="mt-2 text-sm font-medium">
								{inspect.NetworkSettings?.IPAddress || "Docker network scoped"}
							</p>
						</div>
						<div className="rounded-xl border border-default/15 bg-background/60 p-4">
							<p className="text-xs text-muted">Restart count</p>
							<p className="mt-2 text-sm font-medium">{inspect.RestartCount || 0}</p>
						</div>
					</div>
				</section>

				<section className="rounded-2xl border border-default/15 bg-surface p-5">
					<h2 className="text-lg font-semibold tracking-tight">Logs</h2>
					<pre className="mt-4 max-h-[520px] overflow-auto rounded-xl bg-[#050914] p-4 text-xs leading-6 text-white/80">
						{details.logs || "No logs available."}
					</pre>
				</section>
			</div>
		</div>
	);
}
