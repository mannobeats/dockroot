export function getValue(formData: FormData, key: string) {
	return String(formData.get(key) || "").trim();
}

export function getBoolValue(formData: FormData, key: string) {
	const value = getValue(formData, key).trim().toLowerCase();
	if (!value) {
		return false;
	}
	if (["true", "1", "yes", "on", "enabled"].includes(value)) {
		return true;
	}
	if (["false", "0", "no", "off", "disabled"].includes(value)) {
		return false;
	}
	return true;
}

export function getValues(formData: FormData, key: string) {
	return formData
		.getAll(key)
		.map((value) => String(value).trim())
		.filter(Boolean);
}

export function parseJsonValue<T>(formData: FormData, key: string): T | null {
	const raw = getValue(formData, key);
	if (!raw) {
		return null;
	}
	try {
		return JSON.parse(raw) as T;
	} catch {
		throw new Error(`Invalid ${key} payload`);
	}
}

export function requireDestructiveConfirmation(formData: FormData) {
	if (getValue(formData, "__confirmDestructive") !== "yes") {
		throw new Error("Confirmation is required for destructive actions.");
	}
}
