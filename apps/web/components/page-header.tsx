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
		<div className="animate-in flex items-start justify-between gap-4">
			<div className="min-w-0">
				<h1 className="text-lg font-bold tracking-tight">{title}</h1>
				{description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
			</div>
			{actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
		</div>
	);
}
