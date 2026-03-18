import { LinkButton } from "@/components/ui/link-button";

export function DashboardHeader({
	userName,
	greeting,
	environmentName,
	environmentId,
}: {
	userName: string;
	greeting: string;
	environmentName: string;
	environmentId: string;
}) {
	return (
		<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
			<div className="min-w-0">
				<h1 className="break-words text-lg font-bold tracking-tight [overflow-wrap:anywhere]">
					{greeting}, {userName}
				</h1>
				<p className="break-words text-sm text-muted [overflow-wrap:anywhere]">{environmentName}</p>
			</div>
			<LinkButton
				href={`/dashboard/stacks?environment=${environmentId}`}
				size="sm"
				className="self-start"
			>
				Deploy Stack
			</LinkButton>
		</div>
	);
}
