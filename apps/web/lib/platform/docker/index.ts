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
	createNetwork,
	createVolume,
	getContainerDetails,
	getContainerLogs,
	getImageDetails,
	getLocalDockerSnapshot,
	getNetworkDetails,
	getVolumeDetails,
	listContainers,
	listImages,
	listNetworks,
	listStackContainers,
	listVolumes,
	pruneImages,
	pruneNetworks,
	pruneVolumes,
	pullImage,
	removeImage,
	removeNetwork,
	removeVolume,
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
	parseJsonLines,
	parseJsonValue,
	sanitizeTempFileName,
	stripAnsi,
} from "@/lib/platform/docker/parsing";
export type {
	ComposeProjectExport,
	ComposeProjectSummary,
	ContainerBrowserResult,
	CreateContainerInput,
	DockerCommandResult,
} from "@/lib/platform/docker/types";
