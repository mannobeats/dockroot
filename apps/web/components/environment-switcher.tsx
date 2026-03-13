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
			className="h-7 w-full rounded-md border border-default/10 bg-background px-2 text-xs outline-none transition-all duration-150 focus:border-accent/30 focus:ring-2 focus:ring-accent/8"
		>
			{environments.map((environment) => (
				<option key={environment.id} value={environment.id}>
					{environment.name} ({environment.kind})
				</option>
			))}
		</select>
	);
}
