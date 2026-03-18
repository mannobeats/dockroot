import { getLocalDockerSnapshot } from "@/lib/platform/docker";

export async function listRuntimeResources() {
	return getLocalDockerSnapshot();
}
