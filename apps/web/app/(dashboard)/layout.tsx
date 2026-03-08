import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { ensureDefaultLocalEnvironment, listEnvironments } from "@/lib/platform";
import { getServerSession } from "@/lib/session";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
	const session = await getServerSession();

	if (!session?.user.id) {
		redirect("/sign-in");
	}

	await ensureDefaultLocalEnvironment(session.user.id);
	const environments = await listEnvironments(session.user.id);
	const defaultEnvironmentId =
		environments.find((environment) => environment.isDefaultLocal)?.id || environments[0]?.id;

	return (
		<DashboardShell
			environments={environments.map((environment) => ({
				id: environment.id,
				name: environment.name,
				kind: environment.kind,
			}))}
			defaultEnvironmentId={defaultEnvironmentId}
		>
			{children}
		</DashboardShell>
	);
}
