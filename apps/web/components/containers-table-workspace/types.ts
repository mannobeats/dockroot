export type FormAction = (formData: FormData) => void | Promise<void>;

export type ContainerRow = Record<string, string>;

export type ContainerStats = {
	CPUPerc?: string;
	MemPerc?: string;
	MemUsage?: string;
	NetIO?: string;
	BlockIO?: string;
	PIDs?: string;
};

export type RuntimePayload = {
	environmentId?: string;
	at: number;
	containers: Array<{
		Name?: string;
		CPUPerc?: string;
		MemPerc?: string;
		MemUsage?: string;
		NetIO?: string;
		BlockIO?: string;
		PIDs?: string;
	}>;
};

export type ColumnId =
	| "name"
	| "image"
	| "state"
	| "cpu"
	| "memory"
	| "uptime"
	| "netio"
	| "ports"
	| "stack"
	| "updates"
	| "actions";

export type ColumnDef = {
	id: ColumnId;
	label: string;
	defaultVisible: boolean;
	alwaysVisible?: boolean;
};

export type UpdatePolicyRecord = Record<
	string,
	{
		checkEnabled: boolean;
		updateEnabled: boolean;
	}
>;

export type UpdateStateRecord = Record<
	string,
	{
		updateAvailable: boolean;
		majorUpdateAvailable: boolean;
		majorTargetImageRef?: string | null;
		majorTargetTag?: string | null;
		lastResult: string | null;
		lastError?: string | null;
		checkedAt: string | Date | null;
		updatedAt: string | Date | null;
	}
>;
