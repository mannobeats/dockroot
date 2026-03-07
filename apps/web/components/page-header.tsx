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
		<div className="flex flex-col gap-4 rounded-2xl border border-default/20 bg-surface px-5 py-5 sm:px-7 sm:py-6">
			<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
				<div className="space-y-2">
					{kicker ? (
						<p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent/80">
							{kicker}
						</p>
					) : null}
					<div className="space-y-1">
						<h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
						{description ? <p className="max-w-3xl text-[13px] text-muted">{description}</p> : null}
					</div>
				</div>
				{actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
			</div>
		</div>
	);
}
