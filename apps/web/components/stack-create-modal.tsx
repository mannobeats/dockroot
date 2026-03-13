"use client";

import { Github, Layers3, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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

	const title = useMemo(() => {
		return tab === "manual" ? "Create stack manually" : "Create stack from GitHub";
	}, [tab]);

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
			<div className="flex flex-wrap items-center gap-2">
				<Button
					variant="secondary"
					size="sm"
					title="Alt+G"
					onClick={() => {
						setTab("github");
						setOpen(true);
					}}
				>
					<Github className="h-3.5 w-3.5" />
					From GitHub
				</Button>
				<Button
					size="sm"
					title="Alt+C"
					onClick={() => {
						setTab("manual");
						setOpen(true);
					}}
				>
					<Plus className="h-3.5 w-3.5" />
					Create stack
				</Button>
			</div>

			{open ? (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 px-4 py-6 backdrop-blur-sm">
					<button
						type="button"
						aria-label="Close stack creation modal"
						onClick={() => setOpen(false)}
						className="absolute inset-0 h-full w-full cursor-default"
					/>
					<div
						role="dialog"
						aria-modal="true"
						aria-label={title}
						className="relative z-10 flex h-full max-h-[92vh] w-full max-w-[1320px] flex-col overflow-hidden rounded-xl border border-default/15 bg-surface shadow-2xl"
					>
						<div className="flex items-center justify-between border-b border-default/10 px-5 py-4">
							<div className="flex items-center gap-3">
								<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-foreground/[0.05] text-foreground">
									<Layers3 className="h-4 w-4" />
								</div>
								<div>
									<p className="text-sm font-semibold">{title}</p>
									<p className="text-xs text-muted">
										Deploy immediately after configuring compose and env content.
									</p>
								</div>
							</div>
							<div className="flex items-center gap-2">
								<button
									type="button"
									onClick={() => setTab("manual")}
									className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
										tab === "manual"
											? "bg-foreground text-background"
											: "text-muted hover:bg-foreground/[0.04] hover:text-foreground"
									}`}
								>
									Manual
								</button>
								<button
									type="button"
									onClick={() => setTab("github")}
									className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
										tab === "github"
											? "bg-foreground text-background"
											: "text-muted hover:bg-foreground/[0.04] hover:text-foreground"
									}`}
								>
									GitHub
								</button>
								<button
									type="button"
									onClick={() => setOpen(false)}
									className="rounded-md p-1 text-muted transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
									aria-label="Close stack creation modal"
								>
									<X className="h-4 w-4" />
								</button>
							</div>
						</div>

						<div className="flex-1 overflow-y-auto p-5">
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
