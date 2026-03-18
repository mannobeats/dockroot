import "server-only";

import { fetchAgent, fetchAgentJson } from "@/lib/environment-runtime/remote-agent";
import { getEnvironmentRecord } from "@/lib/environment-runtime/environment";

async function fetchLocalTerminal(userId: string, path: string, init?: RequestInit) {
	const response = await fetch(`http://127.0.0.1:${process.env.PORT || 3080}${path}`, {
		...init,
		headers: {
			"x-dockroot-internal-token": process.env.DOCKROOT_TOKEN_PEPPER || "",
			"x-dockroot-user-id": userId,
			...(init?.headers || {}),
		},
		cache: "no-store",
	});

	if (!response.ok) {
		throw new Error(
			response.status === 404 ? "Terminal session not found." : "Local terminal request failed.",
		);
	}

	return response.json();
}

export async function createTerminalSessionForEnvironment(input: {
	userId: string;
	environmentId?: string;
	target: "container";
	containerId?: string;
	shell?: "sh" | "bash" | "ash" | "zsh" | "custom";
	customShell?: string;
	cols?: number;
	rows?: number;
}) {
	const environment = await getEnvironmentRecord(input.environmentId, input.userId);
	if (environment.kind === "local") {
		return fetchLocalTerminal(input.userId, "/internal/local-terminal/sessions", {
			method: "POST",
			headers: {
				"content-type": "application/json",
			},
			body: JSON.stringify({
				target: input.target,
				containerId: input.containerId,
				userId: input.userId,
				shell: input.shell,
				customShell: input.customShell,
				cols: input.cols,
				rows: input.rows,
			}),
		});
	}

	return fetchAgentJson(environment, "/terminal/sessions", {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify({
			target: input.target,
			containerId: input.containerId,
			shell: input.shell,
			customShell: input.customShell,
			cols: input.cols,
			rows: input.rows,
		}),
	});
}

export async function readTerminalSessionForEnvironment(
	userId: string,
	sessionId: string,
	environmentId?: string,
	cursor?: number,
	waitMs?: number,
) {
	const environment = await getEnvironmentRecord(environmentId, userId);
	if (environment.kind === "local") {
		return fetchLocalTerminal(
			userId,
			`/internal/local-terminal/sessions/${encodeURIComponent(sessionId)}?cursor=${Number(cursor || 0)}&waitMs=${Number(waitMs || 0)}`,
		);
	}

	return fetchAgentJson(
		environment,
		`/terminal/sessions/${encodeURIComponent(sessionId)}?cursor=${Number(cursor || 0)}`,
	);
}

export async function writeTerminalInputForEnvironment(input: {
	userId: string;
	environmentId?: string;
	sessionId: string;
	data: string;
}) {
	const environment = await getEnvironmentRecord(input.environmentId, input.userId);
	if (environment.kind === "local") {
		return fetchLocalTerminal(
			input.userId,
			`/internal/local-terminal/sessions/${encodeURIComponent(input.sessionId)}`,
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({ type: "input", data: input.data }),
			},
		);
	}

	return fetchAgentJson(environment, `/terminal/sessions/${encodeURIComponent(input.sessionId)}`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify({ type: "input", data: input.data }),
	});
}

export async function resizeTerminalSessionForEnvironment(input: {
	userId: string;
	environmentId?: string;
	sessionId: string;
	cols: number;
	rows: number;
}) {
	const environment = await getEnvironmentRecord(input.environmentId, input.userId);
	if (environment.kind === "local") {
		return fetchLocalTerminal(
			input.userId,
			`/internal/local-terminal/sessions/${encodeURIComponent(input.sessionId)}`,
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({ type: "resize", cols: input.cols, rows: input.rows }),
			},
		);
	}

	return fetchAgentJson(environment, `/terminal/sessions/${encodeURIComponent(input.sessionId)}`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify({ type: "resize", cols: input.cols, rows: input.rows }),
	});
}

export async function closeTerminalSessionForEnvironment(
	userId: string,
	sessionId: string,
	environmentId?: string,
) {
	const environment = await getEnvironmentRecord(environmentId, userId);
	if (environment.kind === "local") {
		return fetchLocalTerminal(
			userId,
			`/internal/local-terminal/sessions/${encodeURIComponent(sessionId)}`,
			{
				method: "DELETE",
			},
		);
	}

	return fetchAgentJson(environment, `/terminal/sessions/${encodeURIComponent(sessionId)}`, {
		method: "DELETE",
	});
}
