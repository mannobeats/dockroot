"use client";

import type { FormAction } from "@/components/containers-table-workspace/types";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Badge } from "@/components/ui/badge";
import { DataTableCell } from "@/components/ui/data-table";
import { PopoverCard } from "@/components/ui/popover-card";

export function ContainersUpdatesCell({
	containerName,
	containerImage,
	environmentId,
	isProtected,
	checkEnabled,
	updateEnabled,
	checkFailed,
	updateAvailable,
	majorUpdateAvailable,
	majorTargetImageRef,
	majorTargetTag,
	updateErrorMessage,
	setContainerUpdatePolicyAction,
}: {
	containerName: string;
	containerImage: string;
	environmentId: string;
	isProtected: boolean;
	checkEnabled: boolean;
	updateEnabled: boolean;
	checkFailed: boolean;
	updateAvailable: boolean;
	majorUpdateAvailable: boolean;
	majorTargetImageRef: string;
	majorTargetTag: string;
	updateErrorMessage?: string | null;
	setContainerUpdatePolicyAction: FormAction;
}) {
	return (
		<DataTableCell>
			<div className="space-y-1 text-[11px]">
				<div className="flex items-center gap-1">
					<form action={setContainerUpdatePolicyAction}>
						<input type="hidden" name="environmentId" value={environmentId} />
						<input type="hidden" name="containerName" value={containerName} />
						<input type="hidden" name="mode" value="check" />
						<input type="hidden" name="enabled" value={checkEnabled ? "false" : "true"} />
						<FormSubmitButton
							label={checkEnabled ? "Check off" : "Check on"}
							pendingLabel="..."
							size="xs"
							variant="ghost"
							className="h-6 px-2"
							disabled={isProtected}
						/>
					</form>
					<form action={setContainerUpdatePolicyAction}>
						<input type="hidden" name="environmentId" value={environmentId} />
						<input type="hidden" name="containerName" value={containerName} />
						<input type="hidden" name="mode" value="update" />
						<input type="hidden" name="enabled" value={updateEnabled ? "false" : "true"} />
						<FormSubmitButton
							label={updateEnabled ? "Auto off" : "Auto on"}
							pendingLabel="..."
							size="xs"
							variant="ghost"
							className="h-6 px-2"
							disabled={isProtected}
						/>
					</form>
				</div>
				<div className="flex items-center gap-1">
					{checkFailed ? (
						<PopoverCard
							trigger={
								<Badge variant="danger" className="text-[10px]">
									Check failed
								</Badge>
							}
						>
							<div className="space-y-2 text-[11px]">
								<p className="font-medium text-danger">Update check failed</p>
								<p className="text-muted">
									{updateErrorMessage || "Unable to inspect latest image state."}
								</p>
							</div>
						</PopoverCard>
					) : updateAvailable ? (
						<Badge variant="warning" className="text-[10px]">
							Patch/minor available
						</Badge>
					) : majorUpdateAvailable ? (
						<PopoverCard
							trigger={
								<Badge variant="warning" className="text-[10px]">
									Major available
								</Badge>
							}
						>
							<div className="space-y-2 text-[11px]">
								<p className="font-medium text-warning">Major upgrade available</p>
								<p className="text-muted">
									Current:{" "}
									<span className="font-mono text-foreground">{containerImage || "unknown"}</span>
								</p>
								<p className="text-muted">
									Target:{" "}
									<span className="font-mono text-foreground">
										{majorTargetImageRef || "latest"}
									</span>{" "}
									({majorTargetTag})
								</p>
							</div>
						</PopoverCard>
					) : (
						<Badge variant="default" className="text-[10px]">
							Up to date
						</Badge>
					)}
				</div>
			</div>
		</DataTableCell>
	);
}
