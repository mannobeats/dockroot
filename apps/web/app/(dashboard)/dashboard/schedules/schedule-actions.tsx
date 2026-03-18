import {
	runContainerUpdateApplyNowAction,
	runContainerUpdateCheckNowAction,
} from "@/app/(dashboard)/actions";
import { FormSubmitButton } from "@/components/form-submit-button";

export function SchedulePageActions({ environmentId }: { environmentId: string }) {
	return (
		<div className="flex items-center gap-2">
			<form action={runContainerUpdateCheckNowAction}>
				<input type="hidden" name="environmentId" value={environmentId} />
				<FormSubmitButton
					label="Check now"
					pendingLabel="Checking..."
					size="xs"
					variant="outline"
				/>
			</form>
			<form action={runContainerUpdateApplyNowAction}>
				<input type="hidden" name="environmentId" value={environmentId} />
				<FormSubmitButton label="Update now" pendingLabel="Queueing..." size="xs" />
			</form>
		</div>
	);
}
