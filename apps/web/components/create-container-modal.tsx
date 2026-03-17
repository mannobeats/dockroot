"use client";

import { Box, Minus, Plus } from "lucide-react";
import { useCallback, useState } from "react";
import { ActionModal } from "@/components/action-modal";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type FormAction = (formData: FormData) => void | Promise<void>;

type PortMapping = { host: string; container: string };
type VolumeMapping = { host: string; container: string };
type EnvVar = { key: string; value: string };

function DynamicListField<T extends Record<string, string>>({
	label,
	items,
	setItems,
	empty,
	fields,
}: {
	label: string;
	items: T[];
	setItems: (items: T[]) => void;
	empty: T;
	fields: Array<{ key: keyof T; placeholder: string; className?: string }>;
}) {
	return (
		<Field>
			<div className="flex items-center justify-between">
				<FieldLabel>{label}</FieldLabel>
				<button
					type="button"
					onClick={() => setItems([...items, { ...empty }])}
					className="text-xs text-muted transition-colors hover:text-foreground"
				>
					<Plus className="h-3 w-3" />
				</button>
			</div>
			{items.length ? (
				<div className="space-y-1.5">
					{items.map((item, index) => (
						<div key={index} className="flex items-center gap-1.5">
							{fields.map((field) => (
								<Input
									key={String(field.key)}
									placeholder={field.placeholder}
									value={item[field.key]}
									onChange={(event) => {
										const updated = [...items];
										updated[index] = { ...item, [field.key]: event.target.value };
										setItems(updated);
									}}
									className={field.className || "flex-1"}
								/>
							))}
							<button
								type="button"
								onClick={() => setItems(items.filter((_, i) => i !== index))}
								className="text-muted transition-colors hover:text-danger"
							>
								<Minus className="h-3 w-3" />
							</button>
						</div>
					))}
				</div>
			) : null}
		</Field>
	);
}

export function CreateContainerModal({
	action,
	environmentId,
}: {
	action: FormAction;
	environmentId: string;
}) {
	const [open, setOpen] = useState(false);
	const [ports, setPorts] = useState<PortMapping[]>([]);
	const [volumes, setVolumes] = useState<VolumeMapping[]>([]);
	const [envVars, setEnvVars] = useState<EnvVar[]>([]);

	const resetForm = useCallback(() => {
		setPorts([]);
		setVolumes([]);
		setEnvVars([]);
	}, []);

	return (
		<ActionModal
			trigger="Create container"
			triggerIcon={Plus}
			title="Create container"
			description="Run a new standalone Docker container."
			icon={Box}
			open={open}
			onOpenChange={(value) => {
				setOpen(value);
				if (!value) {
					resetForm();
				}
			}}
		>
			<form
				action={(formData) => {
					formData.set("ports", JSON.stringify(ports.filter((p) => p.host && p.container)));
					formData.set("volumes", JSON.stringify(volumes.filter((v) => v.host && v.container)));
					formData.set("envVars", JSON.stringify(envVars.filter((e) => e.key)));
					action(formData);
					setOpen(false);
					resetForm();
				}}
				className="space-y-4"
			>
				<input type="hidden" name="environmentId" value={environmentId} />

				<div className="grid grid-cols-2 gap-3">
					<Field>
						<FieldLabel htmlFor="modal-container-name">Name</FieldLabel>
						<Input id="modal-container-name" name="name" required placeholder="my-container" />
					</Field>
					<Field>
						<FieldLabel htmlFor="modal-container-image">Image</FieldLabel>
						<Input id="modal-container-image" name="image" required placeholder="nginx:latest" />
					</Field>
				</div>

				<div className="grid grid-cols-3 gap-3">
					<Field>
						<FieldLabel htmlFor="modal-container-memory">Memory</FieldLabel>
						<Input id="modal-container-memory" name="memory" placeholder="512m" />
					</Field>
					<Field>
						<FieldLabel htmlFor="modal-container-cpus">CPUs</FieldLabel>
						<Input id="modal-container-cpus" name="cpus" placeholder="1.0" />
					</Field>
					<Field>
						<FieldLabel htmlFor="modal-container-restart">Restart</FieldLabel>
						<Select id="modal-container-restart" name="restartPolicy" defaultValue="no">
							<option value="no">no</option>
							<option value="always">always</option>
							<option value="unless-stopped">unless-stopped</option>
							<option value="on-failure">on-failure</option>
						</Select>
					</Field>
				</div>

				<Field>
					<FieldLabel htmlFor="modal-container-network">Network</FieldLabel>
					<Input id="modal-container-network" name="network" placeholder="bridge" />
				</Field>

				<DynamicListField
					label="Port mappings"
					items={ports}
					setItems={setPorts}
					empty={{ host: "", container: "" }}
					fields={[
						{ key: "host", placeholder: "Host port" },
						{ key: "container", placeholder: "Container port" },
					]}
				/>

				<DynamicListField
					label="Volume mounts"
					items={volumes}
					setItems={setVolumes}
					empty={{ host: "", container: "" }}
					fields={[
						{ key: "host", placeholder: "Host/volume" },
						{ key: "container", placeholder: "Container path" },
					]}
				/>

				<DynamicListField
					label="Environment variables"
					items={envVars}
					setItems={setEnvVars}
					empty={{ key: "", value: "" }}
					fields={[
						{ key: "key", placeholder: "KEY" },
						{ key: "value", placeholder: "value" },
					]}
				/>

				<Field>
					<FieldLabel htmlFor="modal-container-command">Command</FieldLabel>
					<Input
						id="modal-container-command"
						name="command"
						placeholder="Optional override command"
					/>
				</Field>

				<div className="flex justify-end gap-2 pt-2">
					<Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
						Cancel
					</Button>
					<FormSubmitButton label="Create container" pendingLabel="Creating..." />
				</div>
			</form>
		</ActionModal>
	);
}
