"use client";

import { Columns3, PanelRightClose, PanelRightOpen } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ALL_COLUMNS } from "@/components/containers-table-workspace/columns";
import type {
	ColumnId,
	ContainerRow,
	FormAction,
} from "@/components/containers-table-workspace/types";
import { DestructiveActionModal } from "@/components/destructive-action-modal";
import { FormSubmitButton } from "@/components/form-submit-button";

export function ContainersTableToolbar({
	selectedContainers,
	selectedPayload,
	selectedRunning,
	selectedStopped,
	environmentId,
	bulkCheckContainerUpdatesAction,
	bulkApplyContainerUpdatesAction,
	bulkControlContainerAction,
	visibleColumns,
	toggleColumn,
	watchStackId,
	logDockOpen,
	setLogDockOpen,
	clearSelection,
}: {
	selectedContainers: ContainerRow[];
	selectedPayload: string[];
	selectedRunning: ContainerRow[];
	selectedStopped: ContainerRow[];
	environmentId: string;
	bulkCheckContainerUpdatesAction: FormAction;
	bulkApplyContainerUpdatesAction: FormAction;
	bulkControlContainerAction: FormAction;
	visibleColumns: Set<ColumnId>;
	toggleColumn: (columnId: ColumnId) => void;
	watchStackId: string;
	logDockOpen: boolean;
	setLogDockOpen: (open: boolean) => void;
	clearSelection: () => void;
}) {
	const [columnMenuOpen, setColumnMenuOpen] = useState(false);
	const columnMenuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!columnMenuOpen) return;
		const onClick = (event: MouseEvent) => {
			if (columnMenuRef.current && !columnMenuRef.current.contains(event.target as Node)) {
				setColumnMenuOpen(false);
			}
		};
		document.addEventListener("mousedown", onClick);
		return () => document.removeEventListener("mousedown", onClick);
	}, [columnMenuOpen]);

	return (
		<div className="flex min-h-12 flex-wrap items-center gap-1.5 border-b border-default/8 px-3 py-2">
			<p className="mr-2 text-xs text-muted">
				{selectedContainers.length
					? `${selectedContainers.length} selected`
					: "Select one or more containers"}
			</p>
			<form action={bulkCheckContainerUpdatesAction} onSubmit={clearSelection}>
				{selectedContainers.map((container) => (
					<input
						key={`check-${container.ID}`}
						type="hidden"
						name="containerIds"
						value={container.ID}
					/>
				))}
				<input type="hidden" name="environmentId" value={environmentId} />
				<FormSubmitButton
					label="Check updates"
					pendingLabel="Checking..."
					size="xs"
					variant="outline"
					disabled={!selectedContainers.length}
				/>
			</form>
			<form action={bulkApplyContainerUpdatesAction} onSubmit={clearSelection}>
				{selectedContainers.map((container) => (
					<input
						key={`apply-${container.ID}`}
						type="hidden"
						name="containerIds"
						value={container.ID}
					/>
				))}
				<input type="hidden" name="environmentId" value={environmentId} />
				<input type="hidden" name="updateOnlyRunning" value="true" />
				<FormSubmitButton
					label="Update"
					pendingLabel="Queueing..."
					size="xs"
					variant="secondary"
					disabled={!selectedContainers.length}
				/>
			</form>
			<form action={bulkControlContainerAction} onSubmit={clearSelection}>
				{selectedStopped.map((container) => (
					<input
						key={`start-${container.ID}`}
						type="hidden"
						name="containerIds"
						value={container.ID}
					/>
				))}
				<input type="hidden" name="action" value="start" />
				<input type="hidden" name="environmentId" value={environmentId} />
				<FormSubmitButton
					label="Start"
					pendingLabel="Starting..."
					size="xs"
					variant="outline"
					disabled={!selectedStopped.length}
				/>
			</form>
			<form action={bulkControlContainerAction} onSubmit={clearSelection}>
				{selectedRunning.map((container) => (
					<input
						key={`stop-${container.ID}`}
						type="hidden"
						name="containerIds"
						value={container.ID}
					/>
				))}
				<input type="hidden" name="action" value="stop" />
				<input type="hidden" name="environmentId" value={environmentId} />
				<FormSubmitButton
					label="Stop"
					pendingLabel="Stopping..."
					size="xs"
					variant="outline"
					disabled={!selectedRunning.length}
				/>
			</form>
			<form action={bulkControlContainerAction} onSubmit={clearSelection}>
				{selectedRunning.map((container) => (
					<input
						key={`restart-${container.ID}`}
						type="hidden"
						name="containerIds"
						value={container.ID}
					/>
				))}
				<input type="hidden" name="action" value="restart" />
				<input type="hidden" name="environmentId" value={environmentId} />
				<FormSubmitButton
					label="Restart"
					pendingLabel="Restarting..."
					size="xs"
					variant="outline"
					disabled={!selectedRunning.length}
				/>
			</form>
			<DestructiveActionModal
				action={bulkControlContainerAction}
				onConfirm={clearSelection}
				title={`Remove ${selectedContainers.length} container(s)`}
				description="This permanently removes all selected containers."
				triggerLabel="Remove"
				confirmLabel="Remove all"
				pendingLabel="Removing..."
				triggerVariant="danger"
				triggerSize="xs"
				disabled={!selectedContainers.length}
				hiddenFields={{
					containerIds: selectedPayload,
					action: "remove",
					environmentId,
				}}
				options={[
					{
						name: "removeVolumes",
						label: "Remove anonymous volumes",
						description: "Data in attached anonymous volumes will be lost.",
					},
				]}
			/>
			<button
				type="button"
				onClick={clearSelection}
				disabled={!selectedContainers.length}
				className="ml-auto text-xs text-muted transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
			>
				Clear
			</button>
			<div className="relative" ref={columnMenuRef}>
				<button
					type="button"
					onClick={() => setColumnMenuOpen((open) => !open)}
					className="inline-flex h-7 items-center gap-1.5 rounded-md border border-default/15 px-2.5 text-xs text-muted transition-colors hover:border-default/25 hover:text-foreground"
					title="Toggle columns"
				>
					<Columns3 className="h-3.5 w-3.5" />
					Columns
				</button>
				{columnMenuOpen ? (
					<div className="absolute right-0 top-full z-30 mt-1 w-44 rounded-lg border border-default/15 bg-surface py-1 shadow-[var(--shadow-lg)]">
						{ALL_COLUMNS.map((column) => (
							<label
								key={column.id}
								className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs hover:bg-foreground/[0.04] ${
									column.alwaysVisible ? "cursor-not-allowed opacity-50" : ""
								}`}
							>
								<input
									type="checkbox"
									checked={visibleColumns.has(column.id)}
									disabled={column.alwaysVisible}
									onChange={() => toggleColumn(column.id)}
									className="h-3 w-3 rounded border-default/30 accent-accent"
								/>
								{column.label}
							</label>
						))}
					</div>
				) : null}
			</div>
			<button
				type="button"
				onClick={() => setLogDockOpen(!logDockOpen)}
				disabled={!watchStackId}
				className="inline-flex h-7 items-center gap-1.5 rounded-md border border-default/15 px-2.5 text-xs text-muted transition-colors hover:border-default/25 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
				title="Toggle live deploy console"
			>
				{logDockOpen ? (
					<PanelRightClose className="h-3.5 w-3.5" />
				) : (
					<PanelRightOpen className="h-3.5 w-3.5" />
				)}
				Console
			</button>
		</div>
	);
}
