type RuntimeSummary = {
	ID?: string;
	Image?: string;
	Names?: string;
	Labels?: string;
};

const managerComposeProject = process.env.DOCKROOT_MANAGER_COMPOSE_PROJECT || "dockroot";
const managerServiceNames = new Set(["app", "postgres"]);

function getImageVariants(image: string) {
	const variants = new Set([image]);

	if (!image.includes("@")) {
		const lastSlash = image.lastIndexOf("/");
		const tagSeparator = image.lastIndexOf(":");
		const hasExplicitTag = tagSeparator > lastSlash;

		if (!hasExplicitTag) {
			variants.add(`${image}:latest`);
		}
	}

	return variants;
}

function parseDockerLabels(labels: string | undefined) {
	return new Map(
		(labels || "")
			.split(",")
			.map((entry) => entry.trim())
			.filter(Boolean)
			.map((entry) => {
				const separator = entry.indexOf("=");
				if (separator === -1) {
					return [entry, ""] as const;
				}

				return [entry.slice(0, separator), entry.slice(separator + 1)] as const;
			}),
	);
}

export function isProtectedManagerContainer(container: RuntimeSummary) {
	const labels = parseDockerLabels(container.Labels);
	const project = labels.get("com.docker.compose.project");
	const service = labels.get("com.docker.compose.service");

	return (
		project === managerComposeProject && service !== undefined && managerServiceNames.has(service)
	);
}

export function isProtectedManagerStack(projectName: string | undefined | null) {
	return Boolean(projectName) && projectName === managerComposeProject;
}

export function getProtectedStackLabel(projectName: string | undefined | null) {
	if (!isProtectedManagerStack(projectName)) {
		return null;
	}

	return "Protected platform stack";
}

export function getProtectedContainerLabel(container: RuntimeSummary) {
	if (!isProtectedManagerContainer(container)) {
		return null;
	}

	const labels = parseDockerLabels(container.Labels);
	const service = labels.get("com.docker.compose.service") || "service";
	return `Protected ${service} service`;
}

export function getProtectedImageRefs(containers: RuntimeSummary[]) {
	const refs = new Set<string>();

	for (const image of containers
		.filter((container) => isProtectedManagerContainer(container))
		.map((container) => container.Image)
		.filter((image): image is string => Boolean(image))) {
		for (const variant of getImageVariants(image)) {
			refs.add(variant);
		}
	}

	return refs;
}

export function isProtectedManagerImage(imageRef: string, containers: RuntimeSummary[]) {
	return getProtectedImageRefs(containers).has(imageRef);
}
