import type { LucideIcon } from "lucide-react";
import { Panel } from "@/components/ui/panel";

const ACCENT_TONES: Record<string, { bg: string; text: string; border: string }> = {
	blue: { bg: "bg-blue-50 dark:bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", border: "border-t-blue-500" },
	green: { bg: "bg-emerald-50 dark:bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", border: "border-t-emerald-500" },
	amber: { bg: "bg-amber-50 dark:bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", border: "border-t-amber-500" },
	purple: { bg: "bg-purple-50 dark:bg-purple-500/10", text: "text-purple-600 dark:text-purple-400", border: "border-t-purple-500" },
	rose: { bg: "bg-rose-50 dark:bg-rose-500/10", text: "text-rose-600 dark:text-rose-400", border: "border-t-rose-500" },
	neutral: { bg: "bg-foreground/[0.03]", text: "text-muted", border: "border-t-foreground/20" },
};

export function StatCard({
	label,
	value,
	detail,
	icon: Icon,
	accent = "neutral",
}: {
	label: string;
	value: string;
	detail: string;
	icon: LucideIcon;
	accent?: keyof typeof ACCENT_TONES;
}) {
	const tone = ACCENT_TONES[accent] || ACCENT_TONES.neutral;

	return (
		<Panel className={`group border-t-2 ${tone.border} p-5 transition-all duration-200 hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5`}>
			<div className="flex items-center justify-between">
				<span className="text-xs font-medium tracking-wide uppercase text-muted">{label}</span>
				<div className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone.bg} transition-colors`}>
					<Icon className={`h-4 w-4 ${tone.text}`} />
				</div>
			</div>
			<div className="mt-3">
				<p className="text-2xl font-bold tracking-tight">{value}</p>
				<p className="mt-1 text-sm text-muted">{detail}</p>
			</div>
		</Panel>
	);
}
