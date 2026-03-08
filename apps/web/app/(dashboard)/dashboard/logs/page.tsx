import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { getContainerLogs, listContainers } from "@/lib/platform/docker";

function prefixLogLines(name: string, content: string) {
	return content
		.split("\n")
		.filter(Boolean)
		.map((line) => `[${name}] ${line}`)
		.join("\n");
}

export default async function LogsPage({
	searchParams,
}: {
	searchParams: Promise<{ mode?: string; container?: string; containers?: string }>;
}) {
	const params = await searchParams;
	const mode = params.mode === "grouped" ? "grouped" : "single";
	const containers = await listContainers();
	const selectedIds =
		mode === "grouped"
			? (params.containers || "")
					.split(",")
					.map((value) => value.trim())
					.filter(Boolean)
			: ([params.container || containers[0]?.ID].filter(Boolean) as string[]);

	const selectedContainers = containers.filter((container) => selectedIds.includes(container.ID));
	const logPairs = await Promise.all(
		selectedContainers.map(async (container) => ({
			container,
			logs: await getContainerLogs(container.ID, { tail: 250 }),
		})),
	);

	const combinedLogs =
		mode === "grouped"
			? logPairs.map(({ container, logs }) => prefixLogLines(container.Names, logs)).join("\n")
			: logPairs[0]?.logs || "";

	return (
		<div className="space-y-6">
			<PageHeader
				kicker="Runtime"
				title="Logs"
				description="Inspect single-container or grouped runtime logs from the local Docker engine."
				actions={
					<div className="flex items-center gap-2 rounded-xl border border-default/15 bg-surface px-2 py-2">
						<Link
							href={`/dashboard/logs?mode=single${selectedContainers[0] ? `&container=${selectedContainers[0].ID}` : ""}`}
							className={`rounded-lg px-3 py-2 text-sm ${mode === "single" ? "bg-accent text-white" : "text-muted hover:text-foreground"}`}
						>
							Single
						</Link>
						<Link
							href={`/dashboard/logs?mode=grouped&containers=${containers.map((container) => container.ID).join(",")}`}
							className={`rounded-lg px-3 py-2 text-sm ${mode === "grouped" ? "bg-accent text-white" : "text-muted hover:text-foreground"}`}
						>
							Grouped
						</Link>
					</div>
				}
			/>

			<div className="grid gap-5 xl:grid-cols-[320px_1fr]">
				<section className="rounded-2xl border border-default/15 bg-surface p-4">
					<p className="text-sm font-semibold">Containers</p>
					<div className="mt-4 space-y-2">
						{containers.map((container) => {
							const href =
								mode === "grouped"
									? `/dashboard/logs?mode=grouped&containers=${[container.ID, ...selectedIds.filter((id) => id !== container.ID)].join(",")}`
									: `/dashboard/logs?mode=single&container=${container.ID}`;
							const active = selectedIds.includes(container.ID);
							return (
								<Link
									key={container.ID}
									href={href}
									className={`block rounded-xl border px-3 py-3 text-sm transition-colors ${
										active
											? "border-accent/30 bg-accent/10"
											: "border-default/10 bg-background/50 hover:border-default/20"
									}`}
								>
									<p className="font-medium">{container.Names}</p>
									<p className="mt-1 text-xs text-muted">{container.Image}</p>
								</Link>
							);
						})}
					</div>
				</section>

				<section className="rounded-2xl border border-default/15 bg-surface p-4">
					<div className="flex items-center justify-between">
						<p className="text-sm font-semibold">
							{mode === "grouped" ? "Grouped log stream" : selectedContainers[0]?.Names || "Logs"}
						</p>
						<p className="text-xs text-muted">
							{mode === "grouped"
								? `${selectedContainers.length} containers selected`
								: selectedContainers[0]?.Image || "No container selected"}
						</p>
					</div>
					<pre className="mt-4 min-h-[720px] overflow-auto rounded-xl bg-[#050914] p-4 text-xs leading-6 text-white/85">
						{combinedLogs || "No logs available for the selected container set."}
					</pre>
				</section>
			</div>
		</div>
	);
}
