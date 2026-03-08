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
			<div className="space-y-1">
				{kicker ? (
					<p className="text-xs font-medium uppercase tracking-wider text-muted">
						{kicker}
					</p>
				) : null}
				<h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
				{description ? <p className="max-w-2xl text-sm text-muted">{description}</p> : null}
			</div>
			{actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
		</div>
	);
}
