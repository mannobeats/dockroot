export type UnifiedEvent = {
	id: string;
	kind: "deployment" | "runtime";
	severity: "info" | "success" | "warning" | "error";
	actionType: string;
	resourceName: string | null;
	environmentName: string | null;
	userName: string | null;
	source: string | null;
	containerId: string | null;
	details: string | null;
	log: string | null;
	status: string;
	timestamp: string;
	meta: Record<string, string | null>;
};

export type EventCounts = {
	info: number;
	success: number;
	warning: number;
	error: number;
};
