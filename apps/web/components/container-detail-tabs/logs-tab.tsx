import { LinkButton } from "@/components/ui/link-button";
import { LogBlock } from "@/components/ui/log-block";
import { Panel } from "@/components/ui/panel";

interface LogsTabProps {
	containerId: string;
	environmentId: string;
	logs: string;
}

export function LogsTab({ containerId, environmentId, logs }: LogsTabProps) {
	return (
		<Panel padding="sm">
			<div className="flex items-center justify-between">
				<p className="text-sm font-semibold">Container logs</p>
				<LinkButton
					href={`/dashboard/logs?mode=single&container=${containerId}&environment=${environmentId}`}
					variant="ghost"
					size="sm"
				>
					Open live workspace →
				</LinkButton>
			</div>
			<LogBlock className="mt-3 max-h-[680px] p-4">{logs}</LogBlock>
		</Panel>
	);
}
