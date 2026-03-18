import "server-only";

export {
	backupVolume,
	deleteBackupFile,
	getBackupFileSize,
	restoreVolume,
} from "@/lib/platform/docker/backups";
export { runDockerCommand } from "@/lib/platform/docker/command";
export {
	controlComposeProject,
	exportComposeProjectConfig,
	listComposeProjects,
} from "@/lib/platform/docker/compose";
export {
	controlContainer,
	createContainer,
	getContainerDetails,
	getContainerLogs,
	listContainers,
	listStackContainers,
} from "@/lib/platform/docker/containers";
export { deleteLocalStackResources, deployStackLocally } from "@/lib/platform/docker/deployment";
export {
	browseContainerPath,
	deleteContainerPath,
	uploadContainerFile,
	withTempFile,
	writeContainerFile,
} from "@/lib/platform/docker/files";
export {
	getImageDetails,
	listImages,
	pruneImages,
	pullImage,
	removeImage,
} from "@/lib/platform/docker/images";
export {
	createNetwork,
	getNetworkDetails,
	listNetworks,
	pruneNetworks,
	removeNetwork,
} from "@/lib/platform/docker/networks";
export {
	parseJsonLines,
	parseJsonValue,
	sanitizeTempFileName,
	stripAnsi,
} from "@/lib/platform/docker/parsing";
export { getLocalDockerSnapshot } from "@/lib/platform/docker/snapshot";
export type {
	ComposeProjectExport,
	ComposeProjectSummary,
	ContainerBrowserResult,
	CreateContainerInput,
	DockerCommandResult,
} from "@/lib/platform/docker/types";
export {
	createVolume,
	getVolumeDetails,
	listVolumes,
	pruneVolumes,
	removeVolume,
} from "@/lib/platform/docker/volumes";
