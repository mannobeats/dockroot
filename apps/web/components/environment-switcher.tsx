"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from "@/components/ui/dropdown";

export function EnvironmentSwitcher({
	environments,
	defaultEnvironmentId,
}: {
	environments: Array<{ id: string; name: string; kind: string }>;
	defaultEnvironmentId?: string;
}) {
	const pathname = usePathname();
	const router = useRouter();
	const searchParams = useSearchParams();
	const selectedEnvironmentId = searchParams.get("environment") || defaultEnvironmentId || "";
	const selected = environments.find((e) => e.id === selectedEnvironmentId);

	function handleSelect(id: string) {
		const params = new URLSearchParams(searchParams.toString());
		if (id) {
			params.set("environment", id);
		} else {
			params.delete("environment");
		}
		router.push(`${pathname}?${params.toString()}`);
	}

	return (
		<Dropdown className="w-full max-w-[200px]">
			<DropdownTrigger size="sm">
				{selected ? `${selected.name} (${selected.kind})` : "Select environment"}
			</DropdownTrigger>
			<DropdownMenu>
				{environments.map((environment) => (
					<DropdownItem
						key={environment.id}
						value={environment.id}
						selected={environment.id === selectedEnvironmentId}
						onSelect={handleSelect}
					>
						{environment.name}
						<span className="ml-auto text-[10px] text-muted">{environment.kind}</span>
					</DropdownItem>
				))}
			</DropdownMenu>
		</Dropdown>
	);
}
