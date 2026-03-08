"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { FormSubmitButton } from "@/components/form-submit-button";
import { RuntimePortLinks } from "@/components/runtime-port-links";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { LogBlock } from "@/components/ui/log-block";

type Container = Record<string, string>;

interface ContainerDetails {
	inspect: Record<string, unknown>;
	logs: string;
}

type FormAction = (formData: FormData) => void | Promise<void>;

export function StackServicesAccordion({
	containers,
	containerDetailsMap,
	controlContainerAction,
}: {
	containers: Container[];
	containerDetailsMap: Record<string, ContainerDetails>;
	controlContainerAction: FormAction;
}) {
	const [openIds, setOpenIds] = useState<Set<string>>(new Set());

	const toggle = (id: string) => {
		setOpenIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	};

	if (!containers.length) {
		return (
			<EmptyState title="No runtime containers found" description="Deploy to see services here." className="p-8" />
		);
	}

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<h2 className="text-sm font-semibold">Services ({containers.length})</h2>
				<button
					type="button"
					onClick={() => {
						if (openIds.size === containers.length) {
							setOpenIds(new Set());
						} else {
							setOpenIds(new Set(containers.map((c) => c.ID)));
						}
					}}
					className="text-xs text-muted transition-colors hover:text-foreground"
				>
					{openIds.size === containers.length ? "Collapse all" : "Expand all"}
				</button>
			</div>
			{containers.map((container) => {
				const isOpen = openIds.has(container.ID);
				const details = containerDetailsMap[container.ID];

				return (
					<div key={container.ID} className="rounded-xl border border-default/10 bg-surface">
						{/* Accordion header */}
						<button
							type="button"
							onClick={() => toggle(container.ID)}
							className="flex w-full items-center justify-between px-4 py-3 text-left"
						>
							<div className="flex items-center gap-2">
								{isOpen ? (
									<ChevronDown className="h-3.5 w-3.5 text-muted" />
								) : (
									<ChevronRight className="h-3.5 w-3.5 text-muted" />
								)}
								<p className="text-sm font-medium">{container.Names}</p>
								<StatusBadge status={(container.State || "offline").toLowerCase()} />
							</div>
							<div className="flex items-center gap-3">
								{container.Ports ? <RuntimePortLinks ports={container.Ports} compact /> : null}
							</div>
						</button>

						{/* Accordion body */}
						{isOpen ? (
							<div className="border-t border-default/5 px-4 py-3 space-y-3">
								{/* Image + Status row */}
								<div className="flex flex-wrap gap-3 text-xs text-muted">
									<span>{container.Image}</span>
									{container.Status ? <span>· {container.Status}</span> : null}
								</div>

								{/* Actions */}
								<div className="flex flex-wrap gap-1.5">
									{(["start", "stop", "restart"] as const).map((action) => (
										<form key={action} action={controlContainerAction}>
											<input type="hidden" name="containerId" value={container.ID} />
											<input type="hidden" name="action" value={action} />
											<FormSubmitButton
												label={action}
												pendingLabel="..."
												variant="outline"
												size="xs"
												className="capitalize"
											/>
										</form>
									))}
								</div>

								{/* Container logs preview */}
								{details?.logs ? (
									<LogBlock className="max-h-[200px] p-3">
										{details.logs}
									</LogBlock>
								) : (
									<p className="text-xs text-muted">No logs yet.</p>
								)}
							</div>
						) : null}
					</div>
				);
			})}
		</div>
	);
}
