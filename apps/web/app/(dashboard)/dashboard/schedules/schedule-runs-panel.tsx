import { Badge } from "@/components/ui/badge";
import {
	DataTable,
	DataTableBody,
	DataTableCell,
	DataTableEmpty,
	DataTableHead,
	DataTableHeader,
	DataTableRow,
} from "@/components/ui/data-table";
import { Panel } from "@/components/ui/panel";

export function ScheduleRunsPanel({
	runs,
}: {
	runs: Array<{
		id: string;
		startedAt: Date;
		runType: string;
		status: string;
		totalContainers: number;
		queuedStacks: number;
		failedContainers: number;
		summary: string | null;
		error: string | null;
	}>;
}) {
	return (
		<Panel>
			<div className="border-b border-default/8 px-4 py-3">
				<p className="text-sm font-semibold tracking-tight">Recent runs</p>
				<p className="mt-0.5 text-xs text-muted">
					Check and update executions for this environment.
				</p>
			</div>
			<DataTable>
				<DataTableHeader>
					<tr>
						<DataTableHead>Started</DataTableHead>
						<DataTableHead>Type</DataTableHead>
						<DataTableHead>Status</DataTableHead>
						<DataTableHead>Totals</DataTableHead>
						<DataTableHead>Summary</DataTableHead>
					</tr>
				</DataTableHeader>
				<DataTableBody>
					{runs.length ? (
						runs.map((run) => (
							<DataTableRow key={run.id}>
								<DataTableCell className="text-xs text-muted">
									{run.startedAt.toLocaleString()}
								</DataTableCell>
								<DataTableCell>
									<Badge variant="default">{run.runType}</Badge>
								</DataTableCell>
								<DataTableCell>
									<Badge
										variant={
											run.status === "failed"
												? "danger"
												: run.status === "running"
													? "warning"
													: "success"
										}
									>
										{run.status}
									</Badge>
								</DataTableCell>
								<DataTableCell className="text-xs text-muted">
									{run.totalContainers} containers · {run.queuedStacks} stacks queued ·{" "}
									{run.failedContainers} failed
								</DataTableCell>
								<DataTableCell className="text-xs text-muted">
									{run.summary || (run.error ? `Error: ${run.error}` : "—")}
								</DataTableCell>
							</DataTableRow>
						))
					) : (
						<DataTableEmpty colSpan={5}>No schedule runs yet.</DataTableEmpty>
					)}
				</DataTableBody>
			</DataTable>
		</Panel>
	);
}
