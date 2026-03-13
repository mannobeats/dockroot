"use client";

import { ChevronDown, ChevronRight, ExternalLink, Play, RotateCcw, Square } from "lucide-react";
import { useState } from "react";
import { FormSubmitButton } from "@/components/form-submit-button";
import { RuntimePortLinks } from "@/components/runtime-port-links";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkButton } from "@/components/ui/link-button";
import { LogBlock } from "@/components/ui/log-block";

type Container = Record<string, string>;

interface ContainerDetails {
	inspect: Record<string, unknown>;
	logs: string;
}

type FormAction = (formData: FormData) => void | Promise<void>;

const ACTION_ICONS = {
	start: Play,
	stop: Square,
	restart: RotateCcw,
} as const;

export function StackServicesAccordion({
	containers,
	containerDetailsMap,
	controlContainerAction,
	environmentId,
	managerUrl,
}: {
	containers: Container[];
	containerDetailsMap: Record<string, ContainerDetails>;
	controlContainerAction: FormAction;
	environmentId?: string;
	managerUrl?: string | null;
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
			<EmptyState
				title="No runtime containers"
				description="Deploy to see services here."
				className="p-6"
			/>
		);
	}

	return (
		<div className="space-y-1.5">
			<div className="flex items-center justify-between">
				<p className="text-xs font-medium text-muted">Services ({containers.length})</p>
				<button
					type="button"
					onClick={() => {
						if (openIds.size === containers.length) {
							setOpenIds(new Set());
						} else {
							setOpenIds(new Set(containers.map((c) => c.ID)));
						}
					}}
					className="text-[11px] text-muted transition-colors hover:text-foreground"
				>
					{openIds.size === containers.length ? "Collapse" : "Expand all"}
				</button>
			</div>
			{containers.map((container) => {
				const isOpen = openIds.has(container.ID);
				const details = containerDetailsMap[container.ID];

				return (
					<div key={container.ID} className="rounded-lg border border-default/10 bg-surface">
						<button
							type="button"
							onClick={() => toggle(container.ID)}
							className="flex w-full items-center justify-between px-3 py-2.5 text-left"
						>
							<div className="flex items-center gap-2">
								{isOpen ? (
									<ChevronDown className="h-3 w-3 text-muted" />
								) : (
									<ChevronRight className="h-3 w-3 text-muted" />
								)}
								<span className="text-sm font-medium">{container.Names}</span>
								<StatusBadge status={(container.State || "offline").toLowerCase()} />
							</div>
							{container.Ports ? (
								<RuntimePortLinks ports={container.Ports} compact managerUrl={managerUrl} />
							) : null}
						</button>

						{isOpen ? (
							<div className="border-t border-default/5 px-3 py-2.5 space-y-2.5">
								<p className="text-xs text-muted">
									{container.Image}
									{container.Status ? ` · ${container.Status}` : ""}
								</p>

								<div className="flex flex-wrap items-center gap-1">
									{(["start", "stop", "restart"] as const).map((action) => {
										const Icon = ACTION_ICONS[action];
										return (
											<form key={action} action={controlContainerAction}>
												<input type="hidden" name="containerId" value={container.ID} />
												<input type="hidden" name="action" value={action} />
												<FormSubmitButton
													label=""
													pendingLabel=""
													variant="ghost"
													size="icon-xs"
													title={action}
												>
													<Icon className="h-3.5 w-3.5" />
												</FormSubmitButton>
											</form>
										);
									})}
									<LinkButton
										href={`/dashboard/containers/${container.ID}${environmentId ? `?environment=${environmentId}` : ""}`}
										variant="ghost"
										size="icon-xs"
										title="Open container"
									>
										<ExternalLink className="h-3.5 w-3.5" />
									</LinkButton>
								</div>

								{details?.logs ? (
									<LogBlock className="max-h-[180px] p-2.5 text-[11px]">{details.logs}</LogBlock>
								) : (
									<p className="text-[11px] text-muted">No logs yet.</p>
								)}
							</div>
						) : null}
					</div>
				);
			})}
		</div>
	);
}
