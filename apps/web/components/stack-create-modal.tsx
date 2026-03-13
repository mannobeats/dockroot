"use client";

import { Github, Layers3, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { StackComposeForm } from "@/components/stack-compose-form";
import { type InstallationOption, StackGitHubForm } from "@/components/stack-github-form";
import { Button } from "@/components/ui/button";

type FormAction = (formData: FormData) => void | Promise<void>;
type CreateTab = "manual" | "github";

export function StackCreateModal({
	environments,
	installations,
	providers,
	appConfigured,
	createStackAction,
	createGitHubStackAction,
}: {
	environments: Array<{ id: string; name: string; kind: string }>;
	installations: InstallationOption[];
	providers: Array<{
		id: string;
		name: string;
		appSlug: string;
		githubAppId: string;
		createdAt: Date;
		updatedAt: Date;
	}>;
	appConfigured: boolean;
	createStackAction: FormAction;
	createGitHubStackAction: FormAction;
}) {
	const [open, setOpen] = useState(false);
	const [tab, setTab] = useState<CreateTab>("manual");

	useEffect(() => {
		function isTypingTarget(target: EventTarget | null) {
			if (!(target instanceof HTMLElement)) {
				return false;
			}
			const tag = target.tagName.toLowerCase();
			return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
		}

		function onKeyDown(event: KeyboardEvent) {
			if (open && (event.key === "Escape" || event.key.toLowerCase() === "x")) {
				if (event.key.toLowerCase() === "x" && isTypingTarget(event.target)) {
					return;
				}
				event.preventDefault();
				setOpen(false);
				return;
			}

			if (isTypingTarget(event.target)) {
				return;
			}

			if (event.altKey && event.key.toLowerCase() === "c") {
				event.preventDefault();
				setTab("manual");
				setOpen(true);
			}

			if (event.altKey && event.key.toLowerCase() === "g") {
				event.preventDefault();
				setTab("github");
				setOpen(true);
			}
		}

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [open]);

	return (
		<>
			<div className="flex items-center gap-1.5">
				<Button
					variant="ghost"
					size="xs"
					title="Alt+G"
					onClick={() => {
						setTab("github");
						setOpen(true);
					}}
				>
					<Github className="h-3.5 w-3.5" />
				</Button>
				<Button
					size="xs"
					title="Alt+C"
					onClick={() => {
						setTab("manual");
						setOpen(true);
					}}
				>
					<Plus className="h-3 w-3" />
					New
				</Button>
			</div>

			{open ? (
				<div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/80 backdrop-blur-sm">
					<button
						type="button"
						aria-label="Close stack creation modal"
						onClick={() => setOpen(false)}
						className="absolute inset-0 h-full w-full cursor-default"
					/>
					<div
						role="dialog"
						aria-modal="true"
						aria-label={tab === "manual" ? "Create stack" : "Create from GitHub"}
						className="relative z-10 my-8 w-full max-w-4xl rounded-xl border border-default/10 bg-surface shadow-[var(--shadow-lg)]"
					>
						{/* Header */}
						<div className="flex items-center justify-between border-b border-default/8 px-5 py-3.5">
							<div className="flex items-center gap-3">
								<Layers3 className="h-4 w-4 text-muted" />
								<div className="flex items-center gap-0.5 rounded-lg bg-foreground/[0.04] p-0.5">
									<button
										type="button"
										onClick={() => setTab("manual")}
										className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
											tab === "manual"
												? "bg-foreground text-background shadow-sm"
												: "text-muted hover:text-foreground"
										}`}
									>
										Compose
									</button>
									<button
										type="button"
										onClick={() => setTab("github")}
										className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
											tab === "github"
												? "bg-foreground text-background shadow-sm"
												: "text-muted hover:text-foreground"
										}`}
									>
										GitHub
									</button>
								</div>
							</div>
							<button
								type="button"
								onClick={() => setOpen(false)}
								className="rounded-md p-1 text-muted transition-colors hover:text-foreground"
								aria-label="Close"
							>
								<X className="h-4 w-4" />
							</button>
						</div>

						{/* Body */}
						<div className="p-5">
							{tab === "manual" ? (
								<StackComposeForm environments={environments} action={createStackAction} />
							) : (
								<StackGitHubForm
									environments={environments}
									installations={installations}
									providers={providers}
									redirectTo="/dashboard/stacks"
									appConfigured={appConfigured}
									action={createGitHubStackAction}
								/>
							)}
						</div>
					</div>
				</div>
			) : null}
		</>
	);
}
