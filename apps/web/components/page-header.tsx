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
		<div className="flex flex-col gap-4 rounded-[28px] border border-default/20 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.16),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0))] px-5 py-5 sm:px-7 sm:py-6">
			<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
				<div className="space-y-2">
					{kicker ? (
						<p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent/80">
							{kicker}
						</p>
					) : null}
					<div className="space-y-1">
						<h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
						{description ? <p className="max-w-3xl text-sm text-muted">{description}</p> : null}
					</div>
				</div>
				{actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
			</div>
		</div>
	);
}
