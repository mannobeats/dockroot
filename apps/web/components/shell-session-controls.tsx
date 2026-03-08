"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";

type ContainerOption = {
	id: string;
	name: string;
	state: string;
};

export function ShellSessionControls({
	environmentId,
	containers,
	initialTarget,
	initialContainerId,
}: {
	environmentId: string;
	containers: ContainerOption[];
	initialTarget: "container";
	initialContainerId?: string;
}) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const [isPending, startTransition] = useTransition();
	const [target, setTarget] = useState<"container">(initialTarget);
	const [containerId, setContainerId] = useState(initialContainerId || "");

	const submitLabel = "Attach";
	const containerRequired = true;

	return (
		<Panel padding="sm">
			<form
				className="flex flex-col gap-3 sm:flex-row"
				onSubmit={(event) => {
					event.preventDefault();

					startTransition(() => {
						const params = new URLSearchParams(searchParams.toString());
						params.set("environment", environmentId);
						params.set("target", "container");

						if (containerId) {
							params.set("containerId", containerId);
						} else {
							params.delete("containerId");
						}

						router.push(`${pathname}?${params.toString()}`);
					});
				}}
			>
				<Select
					name="target"
					value={target}
					onChange={() => {}}
					disabled
				>
					<option value="container">Container shell</option>
				</Select>
				<Select
					name="containerId"
					value={containerId}
					onChange={(event) => setContainerId(event.target.value)}
					className="flex-1"
					disabled={!containerRequired}
				>
					<option value="">Select container</option>
					{containers.map((container) => (
						<option key={container.id} value={container.id}>
							{container.name} ({container.state})
						</option>
					))}
				</Select>
				<Button type="submit" disabled={isPending || (containerRequired && !containerId)}>
					{submitLabel}
				</Button>
			</form>
			<p className="mt-3 text-xs text-muted">
				Choose a shell target, then connect. Container shells only open after a specific container is selected.
			</p>
		</Panel>
	);
}
