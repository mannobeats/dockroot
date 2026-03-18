import { ArrowLeft } from "lucide-react";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Button } from "@/components/ui/button";

export function StackGitHubConfigureFooterActions({
	onBack,
	canCreateStack,
}: {
	onBack: () => void;
	canCreateStack: boolean;
}) {
	return (
		<div className="flex items-center justify-between border-t border-default/8 pt-4">
			<Button type="button" variant="ghost" size="sm" onClick={onBack}>
				<ArrowLeft className="h-3 w-3" />
				Back
			</Button>
			<FormSubmitButton
				label="Create stack"
				pendingLabel="Creating..."
				size="sm"
				disabled={!canCreateStack}
				title={canCreateStack ? undefined : "Set branch + compose path first."}
			/>
		</div>
	);
}
