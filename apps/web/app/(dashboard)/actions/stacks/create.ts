"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
	parseAdoptComposeInput,
	parseBulkComposeProjects,
	recordAuditEvent,
} from "@/app/(dashboard)/actions/stacks/shared";
import { getBoolValue, getValue } from "@/app/(dashboard)/actions/utils/form-data";
import { requirePrivilegedSession, requireUserSession } from "@/lib/authorization";
import { adoptComposeProject, createGitHubStack, createStack } from "@/lib/platform";
import { isProtectedManagerStack } from "@/lib/runtime-protection";

export async function adoptComposeProjectAction(formData: FormData) {
	const { userId } = await requirePrivilegedSession();
	const { projectName, configFiles } = parseAdoptComposeInput(formData);

	const stackId = await adoptComposeProject({
		userId,
		projectName,
		configFiles,
	});

	revalidatePath("/dashboard/stacks");
	redirect(`/dashboard/stacks?adopted=${stackId}`);
}

export async function createStackAction(formData: FormData) {
	const { userId } = await requireUserSession();
	const environmentId = getValue(formData, "environmentId");
	const name = getValue(formData, "name");
	const description = getValue(formData, "description");
	const composeYaml = getValue(formData, "composeYaml");
	const envFileContent = getValue(formData, "envFileContent");

	if (!environmentId || !name || !composeYaml) {
		throw new Error("Environment, stack name, and compose YAML are required");
	}

	await createStack({
		userId,
		environmentId,
		name,
		description,
		composeYaml,
		envFileContent,
	});
	await recordAuditEvent({
		environmentId,
		userId,
		actionType: "stack.create",
		details: { stackName: name, sourceType: "manual" },
	});

	redirect(`/dashboard/stacks?environment=${encodeURIComponent(environmentId)}`);
}

export async function createGitHubStackAction(formData: FormData) {
	const { userId } = await requireUserSession();
	const environmentId = getValue(formData, "environmentId");
	const installationId = getValue(formData, "installationId");
	const repositoryId = getValue(formData, "repositoryId");
	const owner = getValue(formData, "owner");
	const repository = getValue(formData, "repository");
	const branch = getValue(formData, "branch");
	const composePath = getValue(formData, "composePath");
	const envPath = getValue(formData, "envPath");
	const composeYaml = getValue(formData, "composeYaml");
	const envFileContent = getValue(formData, "envFileContent");
	const autoDeployEnabled = getBoolValue(formData, "autoDeployEnabled");
	const autoDeployPaths = getValue(formData, "autoDeployPaths");
	const name = getValue(formData, "name") || repository;
	const description = getValue(formData, "description");

	if (!environmentId || !installationId || !owner || !repository || !branch || !composePath) {
		throw new Error("Environment, installation, repository, branch, and compose path are required");
	}

	await createGitHubStack({
		userId,
		environmentId,
		installationId,
		repositoryId,
		owner,
		repository,
		branch,
		composePath,
		envPath: envPath || undefined,
		composeYaml,
		envFileContent,
		name,
		description,
		autoDeployEnabled,
		autoDeployPaths: autoDeployPaths || undefined,
	});
	await recordAuditEvent({
		environmentId,
		userId,
		actionType: "stack.create",
		details: {
			stackName: name,
			sourceType: "github",
			repository: `${owner}/${repository}`,
			branch,
			composePath,
		},
	});

	redirect("/dashboard/stacks");
}

export async function bulkAdoptComposeProjectsAction(formData: FormData) {
	const { userId } = await requirePrivilegedSession();
	const projects = parseBulkComposeProjects(formData);

	if (!projects.length) {
		throw new Error("At least one compose project is required.");
	}

	for (const project of projects) {
		if (isProtectedManagerStack(project.projectName)) {
			continue;
		}
		await adoptComposeProject({
			userId,
			projectName: project.projectName,
			configFiles: project.configFiles?.filter(Boolean) || [],
		});
	}
	revalidatePath("/dashboard/stacks");
}
