"use client";

import { Github, Layers3, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { StackComposeForm } from "@/components/stack-compose-form";
import { type InstallationOption, StackGitHubForm } from "@/components/stack-github-form";
import { Button } from "@/components/ui/button";

type FormAction = (formData: FormData) => void | Promise<void>;
type CreateTab = "manual" | "github";

export function StackCreateModal({
	environments,
	installations,
	appConfigured,
	createStackAction,
	createGitHubStackAction,
}: {
	environments: Array<{ id: string; name: string; kind: string }>;
	installations: InstallationOption[];
	appConfigured: boolean;
	createStackAction: FormAction;
	createGitHubStackAction: FormAction;
}) {
	const [open, setOpen] = useState(false);
	const [tab, setTab] = useState<CreateTab>("manual");

	const title = useMemo(() => {
		return tab === "manual" ? "Create stack manually" : "Create stack from GitHub";
	}, [tab]);

	return (
		<>
			<div className="flex flex-wrap items-center gap-2">
				<Button
					variant="secondary"
					size="sm"
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
					<div className="flex h-full max-h-[92vh] w-full max-w-[1320px] flex-col overflow-hidden rounded-2xl border border-default/15 bg-surface shadow-2xl">
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
