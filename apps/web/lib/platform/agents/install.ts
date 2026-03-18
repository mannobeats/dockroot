import { db, environments } from "@dockroot/db";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { resolveManagerUrl } from "@/lib/manager-url";
import { getStoredManagerUrl, issueRegistrationToken } from "../queries";
import { AGENT_IMAGE, AGENT_PORT } from "../shared";

export async function getInstallCommand(
	environmentId: string,
	userId: string,
	options?: { managerUrl?: string | null },
) {
	const environment = await db.query.environments.findFirst({
		where: and(eq(environments.id, environmentId), eq(environments.createdByUserId, userId)),
		with: { agent: true },
	});

	if (!environment?.agent[0]) {
		throw new Error("Environment not found");
	}

	const registrationToken = await issueRegistrationToken(environment.agent[0].id);
	const configuredManagerUrl = await getStoredManagerUrl(userId);
	const managerUrl = resolveManagerUrl({
		configuredUrl: configuredManagerUrl,
		requestManagerUrl: options?.managerUrl || null,
	});
	const dataVolumeName = `dockroot_agent_data_${environment.slug.replace(/-/g, "_")}`;
	const dockerRun = [
		"docker run -d \\",
		`  --name dockroot-agent-${environment.slug} \\`,
		"  --user root \\",
		"  --restart unless-stopped \\",
		"  -v /var/run/docker.sock:/var/run/docker.sock \\",
		`  -v ${dataVolumeName}:/var/lib/dockroot-agent \\`,
		`  -p ${AGENT_PORT}:${AGENT_PORT} \\`,
		`  -e DOCKROOT_MANAGER_URL=${managerUrl} \\`,
		`  -e DOCKROOT_AGENT_REGISTRATION_TOKEN=${registrationToken} \\`,
		`  -e DOCKROOT_AGENT_PORT=${AGENT_PORT} \\`,
		`  ${AGENT_IMAGE}`,
	].join("\n");
	const dockerCompose = [
		"services:",
		"  dockroot-agent:",
		`    image: ${AGENT_IMAGE}`,
		`    container_name: dockroot-agent-${environment.slug}`,
		"    user: root",
		"    restart: unless-stopped",
		"    environment:",
		`      DOCKROOT_MANAGER_URL: ${managerUrl}`,
		`      DOCKROOT_AGENT_REGISTRATION_TOKEN: ${registrationToken}`,
		`      DOCKROOT_AGENT_PORT: ${AGENT_PORT}`,
		"      DOCKROOT_AGENT_DATA_DIR: /var/lib/dockroot-agent",
		"    volumes:",
		"      - /var/run/docker.sock:/var/run/docker.sock",
		`      - ${dataVolumeName}:/var/lib/dockroot-agent`,
		"    ports:",
		`      - "${AGENT_PORT}:${AGENT_PORT}"`,
		"",
		"volumes:",
		`  ${dataVolumeName}:`,
	].join("\n");

	return {
		registrationToken,
		managerUrl,
		dockerRun,
		dockerCompose,
		legacyInstallScript: `${managerUrl}/api/agent/install/${environment.id}`,
	};
}

export async function rotateAgentRegistrationToken({
	environmentId,
	userId,
}: {
	environmentId: string;
	userId: string;
}) {
	const environment = await db.query.environments.findFirst({
		where: and(eq(environments.id, environmentId), eq(environments.createdByUserId, userId)),
		with: {
			agent: true,
		},
	});

	if (!environment?.agent[0]) {
		throw new Error("Environment not found");
	}

	await issueRegistrationToken(environment.agent[0].id);
	revalidatePath("/dashboard/environments");
	revalidatePath(`/dashboard/environments/${environment.id}`);
}
