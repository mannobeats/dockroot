import Link from "next/link";
import { Badge } from "@/components/ui/badge";

type RecentStack = {
	id: string;
	name: string;
	environment: {
		id: string;
		name: string;
	};
};

export function DashboardRecentStacks({
	stacks,
	environmentId,
}: {
	stacks: RecentStack[];
	environmentId: string;
}) {
	if (!stacks.length) {
		return null;
	}

	return (
		<div>
			<div className="mb-2.5 flex items-center justify-between">
				<p className="text-xs font-medium text-muted">Recent Stacks</p>
				<Link
					href={`/dashboard/stacks?environment=${environmentId}`}
					className="text-xs font-medium text-accent hover:text-accent/80"
				>
					View all
				</Link>
			</div>
			<div className="flex gap-3 overflow-x-auto pb-1">
				{stacks.map((stack) => (
					<Link
						key={stack.id}
						href={`/dashboard/stacks/${stack.id}`}
						className="flex min-w-0 shrink-0 items-center gap-3 rounded-lg border border-default/10 bg-surface px-3 py-2.5 transition-colors hover:border-default/18 hover:bg-foreground/[0.02]"
					>
						<p className="truncate text-sm font-medium">{stack.name}</p>
						<Badge className="shrink-0">{stack.environment.name}</Badge>
					</Link>
				))}
			</div>
		</div>
	);
}
