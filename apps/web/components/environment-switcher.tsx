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
		<div className="rounded-2xl border border-default/20 bg-background/60 p-4">
			<p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">
				Environment
			</p>
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
				className="mt-3 h-11 w-full rounded-xl border border-default/15 bg-background px-4 text-sm outline-none transition-colors focus:border-accent"
			>
				{environments.map((environment) => (
					<option key={environment.id} value={environment.id}>
						{environment.name} ({environment.kind})
					</option>
				))}
			</select>
		</div>
	);
}
