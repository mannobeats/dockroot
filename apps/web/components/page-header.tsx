import type { ReactNode } from "react";

export function PageHeader({
	kicker,
	title,
	description,
	actions,
}: {
	kicker?: string;
	title: string;
	description?: string;
	actions?: ReactNode;
}) {
	return (
		<div className="animate-in flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
			<div className="min-w-0">
				{kicker ? (
					<p className="mb-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
						{kicker}
					</p>
				) : null}
				<h1 className="break-words text-lg font-bold tracking-tight [overflow-wrap:anywhere]">
					{title}
				</h1>
				{description ? (
					<p className="mt-0.5 break-words text-sm text-muted [overflow-wrap:anywhere]">
						{description}
					</p>
				) : null}
			</div>
			{actions ? (
				<div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:justify-end">{actions}</div>
			) : null}
		</div>
	);
}
