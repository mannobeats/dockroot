export function createLocalTerminalSession(payload: {
	target?: "host" | "container";
	containerId?: string;
	userId?: string;
	shell?: "sh" | "bash" | "ash" | "zsh" | "custom";
	customShell?: string;
	cols?: number;
	rows?: number;
}): Promise<{ sessionId: string }>;

export function readLocalTerminalSession(
	sessionId: string,
	cursor?: number,
): {
	chunks: string[];
	cursor: number;
	closed: boolean;
	exitCode: number | null;
};

export function readLocalTerminalSessionAsync(
	sessionId: string,
	cursor?: number,
	waitMs?: number,
): Promise<{
	chunks: string[];
	cursor: number;
	closed: boolean;
	exitCode: number | null;
}>;

export function writeLocalTerminalInput(sessionId: string, data: string): { ok: true };
export function resizeLocalTerminalSession(
	sessionId: string,
	cols: number,
	rows: number,
): { ok: true };
export function closeLocalTerminalSession(sessionId: string): { ok: true };
export function verifySessionOwnership(sessionId: string, userId: string): boolean;
