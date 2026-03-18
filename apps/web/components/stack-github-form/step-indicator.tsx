import { Check, ChevronRight } from "lucide-react";

export function StackGitHubStepIndicator({
	step,
	canContinue,
	onSetSource,
	onSetConfigure,
}: {
	step: "source" | "configure";
	canContinue: boolean;
	onSetSource: () => void;
	onSetConfigure: () => void;
}) {
	return (
		<div className="mb-4 flex items-center gap-2 text-xs text-muted">
			<button
				type="button"
				onClick={onSetSource}
				className={`flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors ${
					step === "source"
						? "bg-foreground font-medium text-background shadow-sm"
						: "hover:text-foreground"
				}`}
			>
				<span className="flex h-4 w-4 items-center justify-center rounded-full border border-current text-[10px]">
					{step === "configure" ? <Check className="h-2.5 w-2.5" /> : "1"}
				</span>
				Source
			</button>
			<ChevronRight className="h-3 w-3" />
			<button
				type="button"
				onClick={onSetConfigure}
				disabled={!canContinue}
				className={`flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors ${
					step === "configure"
						? "bg-foreground font-medium text-background shadow-sm"
						: canContinue
							? "hover:text-foreground"
							: "opacity-40"
				}`}
			>
				<span className="flex h-4 w-4 items-center justify-center rounded-full border border-current text-[10px]">
					2
				</span>
				Configure
			</button>
		</div>
	);
}
