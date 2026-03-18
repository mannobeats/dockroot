import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function StackGitHubConfigureMetadataFields({
	stackName,
	description,
	environments,
	defaultEnvironmentId,
	setStackName,
	setDescription,
}: {
	stackName: string;
	description: string;
	environments: Array<{ id: string; name: string; kind: string }>;
	defaultEnvironmentId?: string;
	setStackName: (value: string) => void;
	setDescription: (value: string) => void;
}) {
	return (
		<>
			<div className="grid gap-3 sm:grid-cols-2">
				<Field>
					<FieldLabel htmlFor="github-stack-name">Stack name</FieldLabel>
					<Input
						id="github-stack-name"
						value={stackName}
						onChange={(event) => setStackName(event.target.value)}
						placeholder="my-app"
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor="github-environment-id">Environment</FieldLabel>
					<Select
						id="github-environment-id"
						name="environmentId"
						required
						defaultValue={defaultEnvironmentId || environments[0]?.id}
					>
						{environments.map((environment) => (
							<option key={environment.id} value={environment.id}>
								{environment.name} ({environment.kind})
							</option>
						))}
					</Select>
				</Field>
			</div>

			<Field>
				<FieldLabel htmlFor="github-stack-description">Description</FieldLabel>
				<Input
					id="github-stack-description"
					value={description}
					onChange={(event) => setDescription(event.target.value)}
					placeholder="Frontend + API + worker"
				/>
			</Field>
		</>
	);
}
