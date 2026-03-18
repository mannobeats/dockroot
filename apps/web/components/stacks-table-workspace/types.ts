export type FormAction = (formData: FormData) => void | Promise<void>;

export type StackContainer = Record<string, string>;

export type TrackedStackRow = {
	type: "tracked";
	slug: string;
	name: string;
	status: string;
	stackId: string;
	environmentName: string;
	sourceType: string;
	containerCount: number;
	runningCount: number;
	containers: StackContainer[];
	lastDeployment: { id: string; status: string; log?: string | null } | null;
	isProtected: boolean;
};

export type UntrackedStackRow = {
	type: "untracked";
	slug: string;
	name: string;
	status: string;
	stackId: null;
	environmentName: string;
	sourceType: "external";
	containerCount: number;
	runningCount: number;
	containers: StackContainer[];
	configFiles: string[];
	lastDeployment: null;
	isProtected: boolean;
};

export type StackRow = TrackedStackRow | UntrackedStackRow;

export type StacksTableWorkspaceProps = {
	stacks: StackRow[];
	includeUntracked: boolean;
	environmentId?: string;
	initialWatchStackId?: string;
	deployStackAction: FormAction;
	destroyStackAction: FormAction;
	adoptComposeProjectAction: FormAction;
	controlComposeProjectAction: FormAction;
	bulkRestartStacksAction: FormAction;
	bulkStopStacksAction: FormAction;
	bulkDestroyStacksAction: FormAction;
	bulkRemoveStacksAction: FormAction;
};
