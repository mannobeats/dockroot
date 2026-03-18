import { headers } from "next/headers";
import { EnvironmentLiveRefresh } from "@/components/environment-live-refresh";
import { getRuntimeSnapshotForEnvironment } from "@/lib/environment-runtime";
import { inferRequestManagerUrl } from "@/lib/manager-url";
import { getEnvironmentById, getInstallCommand } from "@/lib/platform";
import { getServerSession } from "@/lib/session";
import { EnvironmentActivityPanels } from "./environment-activity-panels";
import { EnvironmentConnectionCards } from "./environment-connection-cards";
import { EnvironmentDetailsForm } from "./environment-details-form";
import { EnvironmentDetailHeader } from "./environment-header";
import { EnvironmentInstallCommands } from "./environment-install-commands";

export default async function EnvironmentDetailPage({
	params,
}: {
	params: Promise<{ environmentId: string }>;
}) {
	const session = await getServerSession();

	if (!session?.user.id) {
		return null;
	}

	const { environmentId } = await params;
	const requestHeaders = await headers();
	const environment = await getEnvironmentById(environmentId, session.user.id);

	if (!environment) {
		return <div className="text-sm text-muted">Environment not found.</div>;
	}

	const detectedManagerUrl = inferRequestManagerUrl(requestHeaders);
	const runtime =
		environment.kind === "local"
			? await getRuntimeSnapshotForEnvironment(session.user.id, environment.id).catch(() => null)
			: null;
	const installCommands =
		environment.kind === "agent"
			? await getInstallCommand(environment.id, session.user.id, {
					managerUrl: detectedManagerUrl,
				})
			: null;
	const agent = environment.agent[0];
	const hostname =
		environment.kind === "local"
			? runtime?.snapshot.host.hostname || agent?.hostname || "Unavailable"
			: agent?.hostname || "Pending install";
	const dockerVersion =
		environment.kind === "local"
			? runtime?.snapshot.host.dockerVersion || agent?.dockerVersion || "Unavailable"
			: agent?.dockerVersion || "Pending install";
	const runtimeEndpoint =
		environment.kind === "local"
			? detectedManagerUrl || environment.managerUrl || "Not configured"
			: environment.managerUrl || "Not configured";

	return (
		<div className="animate-in space-y-5">
			<EnvironmentLiveRefresh environmentId={environment.id} />
			<EnvironmentDetailHeader environment={environment} />
			<EnvironmentConnectionCards
				environment={environment}
				runtimeEndpoint={runtimeEndpoint}
				hostname={hostname}
				dockerVersion={dockerVersion}
			/>
			<EnvironmentDetailsForm environment={environment} />
			{installCommands ? (
				<EnvironmentInstallCommands
					environmentId={environment.id}
					installCommands={installCommands}
				/>
			) : null}
			<EnvironmentActivityPanels
				stacks={environment.stacks}
				deployments={environment.deployments}
			/>
		</div>
	);
}
