export type ShellContainerOption = {
	id: string;
	name: string;
	state: string;
	status: string;
	image: string;
};

export type ShellOption = "sh" | "bash" | "ash" | "zsh" | "custom";

export const shellOptions: Array<{ value: ShellOption; label: string }> = [
	{ value: "sh", label: "sh" },
	{ value: "bash", label: "bash" },
	{ value: "ash", label: "ash" },
	{ value: "zsh", label: "zsh" },
	{ value: "custom", label: "Custom" },
];

export function matchesContainerSearch(container: ShellContainerOption, query: string) {
	const value = query.trim().toLowerCase();
	if (!value) {
		return true;
	}

	return [container.name, container.image, container.state, container.status, container.id]
		.filter(Boolean)
		.some((field) => field.toLowerCase().includes(value));
}
