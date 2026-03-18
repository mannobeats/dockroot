import { GitBranch, Github, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function StackGitHubConfigureRepositorySummary({
	repositoryFullName,
	branch,
	isLoaded,
	headSha,
}: {
	repositoryFullName?: string;
	branch: string;
	isLoaded: boolean;
	headSha: string;
}) {
	return (
		<div className="flex items-center gap-2 rounded-lg border border-default/8 bg-surface-raised px-3 py-2">
			<Github className="h-3.5 w-3.5 text-muted" />
			<span className="text-xs font-medium">{repositoryFullName}</span>
			<Badge variant="accent" className="text-[10px]">
				<GitBranch className="mr-0.5 h-2.5 w-2.5" />
				{branch}
			</Badge>
			{isLoaded ? (
				<span className="inline-flex items-center gap-1 text-[10px] text-success">
					<Sparkles className="h-2.5 w-2.5" />
					{headSha.slice(0, 8)}
				</span>
			) : null}
		</div>
	);
}
