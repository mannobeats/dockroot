import { updateEnvironmentAction } from "@/app/(dashboard)/actions";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";

export function EnvironmentDetailsForm({
	environment,
}: {
	environment: {
		id: string;
		name: string;
		description: string | null;
		kind: string;
		managerUrl: string | null;
	};
}) {
	return (
		<Panel className="space-y-3 p-4">
			<div>
				<p className="text-sm font-semibold">Environment details</p>
				<p className="mt-1 text-xs text-muted">
					Rename this environment to keep your sidebar and workspace organized.
				</p>
			</div>
			<form
				action={updateEnvironmentAction}
				className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_auto]"
			>
				<input type="hidden" name="environmentId" value={environment.id} />
				<Field>
					<FieldLabel htmlFor="environment-name">Name</FieldLabel>
					<Input id="environment-name" name="name" required defaultValue={environment.name} />
				</Field>
				<Field>
					<FieldLabel htmlFor="environment-description">Description</FieldLabel>
					<Input
						id="environment-description"
						name="description"
						defaultValue={environment.description || ""}
						placeholder="Short description for this environment"
					/>
				</Field>
				{environment.kind === "agent" ? (
					<Field>
						<FieldLabel htmlFor="environment-agent-url">Agent URL</FieldLabel>
						<Input
							id="environment-agent-url"
							name="agentUrl"
							defaultValue={environment.managerUrl || ""}
							placeholder="http://remote-host:9095"
						/>
					</Field>
				) : null}
				<div className="flex items-end">
					<FormSubmitButton label="Save changes" pendingLabel="Saving..." size="sm" />
				</div>
			</form>
		</Panel>
	);
}
