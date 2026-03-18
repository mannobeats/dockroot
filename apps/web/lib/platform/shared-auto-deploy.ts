export function parseAutoDeployPathPatterns(raw: string | null | undefined) {
	return (raw || "")
		.split(/\r?\n|,/u)
		.map((entry) => entry.trim())
		.filter(Boolean);
}

function normalizePathForMatch(path: string) {
	return path.replace(/\\/g, "/").replace(/^\.\/+/, "");
}

function pathMatchesPattern(path: string, pattern: string) {
	const normalizedPath = normalizePathForMatch(path);
	const normalizedPattern = normalizePathForMatch(pattern);
	if (!normalizedPattern) {
		return false;
	}

	if (normalizedPattern.endsWith("/**")) {
		const prefix = normalizedPattern.slice(0, -3);
		return normalizedPath.startsWith(prefix);
	}

	if (normalizedPattern.endsWith("/*")) {
		const prefix = normalizedPattern.slice(0, -2);
		if (!normalizedPath.startsWith(prefix)) {
			return false;
		}
		const remainder = normalizedPath.slice(prefix.length).replace(/^\/+/, "");
		return remainder.length > 0 && !remainder.includes("/");
	}

	return normalizedPath === normalizedPattern || normalizedPath.startsWith(`${normalizedPattern}/`);
}

export function shouldTriggerAutoDeployForPaths(input: {
	patterns: string[];
	changedPaths: string[];
	composePath: string | null;
	envPath: string | null;
}) {
	if (!input.patterns.length) {
		return true;
	}

	const mandatoryPaths = [input.composePath, input.envPath].filter(Boolean) as string[];
	const effectivePaths = [...input.changedPaths, ...mandatoryPaths];
	return effectivePaths.some((changedPath) =>
		input.patterns.some((pattern) => pathMatchesPattern(changedPath, pattern)),
	);
}
