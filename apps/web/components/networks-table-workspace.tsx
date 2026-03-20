"use client";

import { ExternalLink, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { DestructiveActionModal } from "@/components/destructive-action-modal";
import {
	DataTable,
	DataTableBody,
	DataTableCell,
	DataTableEmpty,
	DataTableHead,
	DataTableHeader,
	DataTableRow,
} from "@/components/ui/data-table";
import { LinkButton } from "@/components/ui/link-button";

type FormAction = (formData: FormData) => void | Promise<void>;

type NetworkRow = Record<string, string>;

export function NetworksTableWorkspace({
	networks,
	environmentId,
	removeNetworkAction,
	bulkRemoveNetworksAction,
}: {
	networks: NetworkRow[];
	environmentId: string;
	removeNetworkAction: FormAction;
	bulkRemoveNetworksAction: FormAction;
}) {
	const [selectedNames, setSelectedNames] = useState<Record<string, boolean>>({});
	const allNames = useMemo(() => networks.map((network) => network.Name), [networks]);
	const selected = useMemo(
		() => networks.filter((network) => selectedNames[network.Name]),
		[networks, selectedNames],
	);
	const allSelected = allNames.length > 0 && allNames.every((name) => selectedNames[name]);

	return (
		<>
			<div className="flex min-h-12 flex-wrap items-center gap-1.5 border-b border-default/8 px-3 py-2">
				<p className="mr-2 text-xs text-muted">
					{selected.length ? `${selected.length} selected` : "Select one or more networks"}
				</p>
				<DestructiveActionModal
					action={bulkRemoveNetworksAction}
					onConfirm={() => {
						setSelectedNames({});
					}}
					title={`Remove ${selected.length} network(s)`}
					description="This permanently removes all selected Docker networks."
					triggerLabel="Remove"
					confirmLabel="Remove all"
					pendingLabel="Removing..."
					triggerVariant="danger"
					triggerSize="xs"
					disabled={!selected.length}
					hiddenFields={{ names: selected.map((network) => network.Name), environmentId }}
				/>
				<button
					type="button"
					onClick={() => setSelectedNames({})}
					disabled={!selected.length}
					className="ml-auto text-xs text-muted transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
				>
					Clear
				</button>
			</div>

			<DataTable>
				<DataTableHeader>
					<tr>
						<DataTableHead className="w-8">
							<input
								type="checkbox"
								aria-label="Select all networks"
								checked={allSelected}
								onChange={(event) => {
									if (!event.target.checked) {
										setSelectedNames({});
										return;
									}
									setSelectedNames((current) => ({
										...current,
										...Object.fromEntries(allNames.map((name) => [name, true])),
									}));
								}}
								className="h-3.5 w-3.5 rounded border-default/30 bg-background"
							/>
						</DataTableHead>
						<DataTableHead>Name</DataTableHead>
						<DataTableHead>Driver</DataTableHead>
						<DataTableHead>Scope</DataTableHead>
						<DataTableHead className="w-16 text-right">Actions</DataTableHead>
					</tr>
				</DataTableHeader>
				<DataTableBody>
					{networks.length ? (
						networks.map((network) => (
							<DataTableRow key={`${network.ID}-${network.Name}`}>
								<DataTableCell>
									<input
										type="checkbox"
										aria-label={`Select ${network.Name}`}
										checked={Boolean(selectedNames[network.Name])}
										onChange={(event) =>
											setSelectedNames((current) => ({
												...current,
												[network.Name]: event.target.checked,
											}))
										}
										className="h-3.5 w-3.5 rounded border-default/30 bg-background"
									/>
								</DataTableCell>
								<DataTableCell>
									<Link
										href={`/dashboard/networks/${encodeURIComponent(network.Name)}?environment=${environmentId}`}
										className="font-medium transition-colors hover:text-accent"
									>
										{network.Name}
									</Link>
								</DataTableCell>
								<DataTableCell className="text-xs text-muted">{network.Driver}</DataTableCell>
								<DataTableCell className="text-xs text-muted">
									{network.Scope || "local"}
								</DataTableCell>
								<DataTableCell>
									<div className="flex items-center justify-end gap-0.5">
										<LinkButton
											href={`/dashboard/networks/${encodeURIComponent(network.Name)}?environment=${environmentId}`}
											variant="ghost"
											size="icon-xs"
											title="View"
										>
											<ExternalLink className="h-3.5 w-3.5" />
										</LinkButton>
										<DestructiveActionModal
											action={removeNetworkAction}
											title={`Remove network ${network.Name}`}
											description="This permanently removes the Docker network."
											triggerLabel=""
											confirmLabel="Remove"
											pendingLabel="Removing..."
											triggerVariant="ghost"
											triggerSize="xs"
											hiddenFields={{ name: network.Name, environmentId }}
											triggerClassName="h-6 w-6 p-0 text-muted hover:text-danger"
											triggerIcon={<Trash2 className="h-3.5 w-3.5" />}
											triggerTitle="Remove"
										/>
									</div>
								</DataTableCell>
							</DataTableRow>
						))
					) : (
						<DataTableEmpty colSpan={5}>No networks found.</DataTableEmpty>
					)}
				</DataTableBody>
			</DataTable>
		</>
	);
}
