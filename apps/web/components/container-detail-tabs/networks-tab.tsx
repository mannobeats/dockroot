import Link from "next/link";
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

interface NetworksTabProps {
	networkEntries: Array<[string, { IPAddress?: string; Gateway?: string }]>;
	canOpenRuntimeTopology: boolean;
	environmentId: string;
}

export function NetworksTab({
	networkEntries,
	canOpenRuntimeTopology,
	environmentId,
}: NetworksTabProps) {
	return (
		<Panel>
			<DataTable>
				<DataTableHeader>
					<tr>
						<DataTableHead>Network</DataTableHead>
						<DataTableHead>IP Address</DataTableHead>
						<DataTableHead>Gateway</DataTableHead>
					</tr>
				</DataTableHeader>
				<DataTableBody>
					{networkEntries.length ? (
						networkEntries.map(([name, network]) => (
							<DataTableRow key={name}>
								<DataTableCell className="font-medium">
									{canOpenRuntimeTopology ? (
										<Link
											href={`/dashboard/networks/${encodeURIComponent(name)}?environment=${environmentId}`}
											className="transition-colors hover:text-foreground/80"
										>
											{name}
										</Link>
									) : (
										name
									)}
								</DataTableCell>
								<DataTableCell className="text-xs text-muted">
									{network.IPAddress || "—"}
								</DataTableCell>
								<DataTableCell className="text-xs text-muted">
									{network.Gateway || "—"}
								</DataTableCell>
							</DataTableRow>
						))
					) : (
						<DataTableEmpty colSpan={3}>No network attachments.</DataTableEmpty>
					)}
				</DataTableBody>
			</DataTable>
		</Panel>
	);
}
