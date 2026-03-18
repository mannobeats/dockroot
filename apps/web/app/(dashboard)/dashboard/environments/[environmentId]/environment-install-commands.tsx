import { rotateAgentRegistrationTokenAction } from "@/app/(dashboard)/actions";
import { CopyButton } from "@/components/copy-button";
import { FormSubmitButton } from "@/components/form-submit-button";
import { LogBlock } from "@/components/ui/log-block";
import { Panel } from "@/components/ui/panel";

export function EnvironmentInstallCommands({
	environmentId,
	installCommands,
}: {
	environmentId: string;
	installCommands: {
		managerUrl: string;
		dockerCompose: string;
		dockerRun: string;
	};
}) {
	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<p className="text-sm font-semibold">Install commands</p>
				<form action={rotateAgentRegistrationTokenAction}>
					<input type="hidden" name="environmentId" value={environmentId} />
					<FormSubmitButton
						label="Rotate token"
						pendingLabel="Rotating..."
						variant="outline"
						size="xs"
					/>
				</form>
			</div>
			<Panel className="px-3 py-2">
				<p className="text-xs font-medium text-muted">Manager address used in generated commands</p>
				<p className="mt-1 break-all text-sm font-medium text-foreground">
					{installCommands.managerUrl}
				</p>
				<p className="mt-1 text-[11px] text-muted">
					Update this from Settings if you want agents to connect through a different IP or domain.
				</p>
			</Panel>
			<div className="grid gap-3 xl:grid-cols-2">
				<Panel className="bg-console p-3">
					<div className="flex items-center justify-between gap-3">
						<p className="text-xs font-medium text-console-foreground/60">Docker Compose</p>
						<CopyButton value={installCommands.dockerCompose} />
					</div>
					<LogBlock className="mt-2 border-0 bg-transparent p-0 text-console-foreground/90">
						{installCommands.dockerCompose}
					</LogBlock>
				</Panel>
				<Panel className="bg-console p-3">
					<div className="flex items-center justify-between gap-3">
						<p className="text-xs font-medium text-console-foreground/60">Docker Run</p>
						<CopyButton value={installCommands.dockerRun} />
					</div>
					<LogBlock className="mt-2 border-0 bg-transparent p-0 text-console-foreground/90">
						{installCommands.dockerRun}
					</LogBlock>
				</Panel>
			</div>
		</div>
	);
}
