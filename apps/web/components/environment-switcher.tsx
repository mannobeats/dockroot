"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

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

	return (
		<select
			value={selectedEnvironmentId}
			onChange={(event) => {
				const params = new URLSearchParams(searchParams.toString());
				if (event.target.value) {
					params.set("environment", event.target.value);
				} else {
					params.delete("environment");
				}
				router.push(`${pathname}?${params.toString()}`);
			}}
			className="h-9 w-full rounded-lg border border-default/10 bg-background px-3 text-sm outline-none transition-colors focus:border-foreground/20"
		>
			{environments.map((environment) => (
				<option key={environment.id} value={environment.id}>
					{environment.name} ({environment.kind})
				</option>
			))}
		</select>
	);
}
