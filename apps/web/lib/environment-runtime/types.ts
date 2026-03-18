import "server-only";

export class RuntimeConnectionError extends Error {
	code:
		| "remote_unavailable"
		| "agent_not_registered"
		| "agent_unauthorized"
		| "agent_request_failed";

	constructor(
		code:
			| "remote_unavailable"
			| "agent_not_registered"
			| "agent_unauthorized"
			| "agent_request_failed",
		message: string,
	) {
		super(message);
		this.name = "RuntimeConnectionError";
		this.code = code;
	}
}

export function isRuntimeConnectionError(error: unknown): error is RuntimeConnectionError {
	return error instanceof RuntimeConnectionError;
}

export function getRuntimeConnectionMessage(error: unknown) {
	if (error instanceof RuntimeConnectionError) {
		return error.message;
	}
	return error instanceof Error ? error.message : "Runtime connection is unavailable.";
}
