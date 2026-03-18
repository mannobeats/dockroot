import "server-only";

import { getEnvironmentRecord } from "@/lib/environment-runtime/environment";
import { fetchAgent, fetchAgentJson } from "@/lib/environment-runtime/remote-agent";
import {
	getImageDetails,
	listImages,
	pruneImages,
	pullImage,
	removeImage,
} from "@/lib/platform/docker";

type ImageList = Awaited<ReturnType<typeof listImages>>;
type ImageDetails = Awaited<ReturnType<typeof getImageDetails>>;

export async function listImagesForEnvironment(userId: string, environmentId?: string) {
	const environment = await getEnvironmentRecord(environmentId, userId);
	if (environment.kind === "local") {
		return {
			environment,
			images: await listImages(),
		};
	}

	return {
		environment,
		images: await fetchAgentJson<ImageList>(environment, "/images"),
	};
}

export async function getImageDetailsForEnvironment(
	userId: string,
	imageRef: string,
	environmentId?: string,
) {
	const environment = await getEnvironmentRecord(environmentId, userId);
	if (environment.kind === "local") {
		return {
			environment,
			image: await getImageDetails(imageRef),
		};
	}

	return {
		environment,
		image: await fetchAgentJson<ImageDetails>(
			environment,
			`/images/${encodeURIComponent(imageRef)}`,
		),
	};
}

export async function pullImageForEnvironment(
	userId: string,
	imageRef: string,
	environmentId?: string,
) {
	const environment = await getEnvironmentRecord(environmentId, userId);
	if (environment.kind === "local") {
		return pullImage(imageRef);
	}

	await fetchAgent(environment, "/images/pull", {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify({ imageRef }),
	});
}

export async function removeImageForEnvironment(
	userId: string,
	imageRef: string,
	environmentId?: string,
) {
	const environment = await getEnvironmentRecord(environmentId, userId);
	if (environment.kind === "local") {
		return removeImage(imageRef);
	}

	await fetchAgent(environment, "/images/remove", {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify({ imageRef }),
	});
}

export async function pruneImagesForEnvironment(
	userId: string,
	environmentId?: string,
	options?: { all?: boolean },
) {
	const environment = await getEnvironmentRecord(environmentId, userId);
	if (environment.kind === "local") {
		return pruneImages(options);
	}

	await fetchAgent(environment, "/images/prune", {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify(options || {}),
	});
}
