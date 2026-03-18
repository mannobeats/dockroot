import "server-only";

export type DockerCommandResult = {
	stdout: string;
	stderr: string;
	code: number;
	ok: boolean;
};

export type ContainerBrowserResult = {
	kind: "directory" | "file" | "missing";
	path: string;
	entries?: Array<{ name: string; kind: "dir" | "file" | "other" }>;
	content?: string;
};

export type ComposeProjectSummary = {
	name: string;
	status: string;
	configFiles: string[];
	containers: Array<Record<string, string>>;
	containerCount: number;
	runningCount: number;
};

export type ComposeProjectExport = {
	projectName: string;
	composeYaml: string;
	envFileContent: string | null;
	configFiles: string[];
};

export type CreateContainerInput = {
	name: string;
	image: string;
	memory?: string;
	cpus?: string;
	restartPolicy?: string;
	ports?: Array<{ host: string; container: string }>;
	volumes?: Array<{ host: string; container: string }>;
	envVars?: Array<{ key: string; value: string }>;
	network?: string;
	command?: string;
};
