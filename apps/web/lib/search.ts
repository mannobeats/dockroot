function normalizeToken(value: string) {
	return value
		.normalize("NFKD")
		.replaceAll(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.trim();
}

export function normalizeSearchText(...values: Array<unknown>) {
	return values
		.flatMap((value) => {
			if (value == null) {
				return [];
			}
			if (Array.isArray(value)) {
				return value.map((entry) => String(entry));
			}
			if (typeof value === "object") {
				return Object.values(value as Record<string, unknown>).map((entry) => String(entry ?? ""));
			}
			return [String(value)];
		})
		.map((value) => normalizeToken(value))
		.filter(Boolean)
		.join(" ");
}

export function createSearchTokens(query: string) {
	return Array.from(
		new Set(
			normalizeToken(query)
				.split(/\s+/)
				.map((token) => token.trim())
				.filter(Boolean),
		),
	);
}

export function matchesSearchQuery(query: string, ...values: Array<unknown>) {
	const tokens = createSearchTokens(query);
	if (!tokens.length) {
		return true;
	}

	const haystack = normalizeSearchText(...values);
	return tokens.every((token) => haystack.includes(token));
}
