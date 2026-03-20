"use client";

import { ArrowUp, ChevronRight, File, FileText, Folder, Save, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { CodeEditor } from "@/components/code-editor";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";

interface ContainerFileBrowserProps {
	containerId: string;
	path: string;
	browser:
		| {
				kind: "directory";
				path: string;
				entries: Array<{ name: string; kind: "dir" | "file" | "other" }>;
		  }
		| {
				kind: "file";
				path: string;
				content: string;
		  }
		| {
				kind: "missing";
				path: string;
		  };
}

function buildBreadcrumbs(path: string) {
	if (path === "/") return [{ label: "/", path: "/" }];
	const parts = path.split("/").filter(Boolean);
	const crumbs = [{ label: "/", path: "/" }];
	let accumulated = "";
	for (const part of parts) {
		accumulated += `/${part}`;
		crumbs.push({ label: part, path: accumulated });
	}
	return crumbs;
}

function getFileIcon(kind: "dir" | "file" | "other") {
	if (kind === "dir") return <Folder className="h-4 w-4 text-accent/70" />;
	return <FileText className="h-4 w-4 text-muted/60" />;
}

function buildHref(containerId: string, path: string, environmentId?: string) {
	return `/dashboard/containers/${containerId}?path=${encodeURIComponent(path)}${environmentId ? `&environment=${encodeURIComponent(environmentId)}` : ""}`;
}

export function ContainerFileBrowser({
	containerId,
	path,
	browser,
	environmentId,
}: ContainerFileBrowserProps & { environmentId?: string }) {
	const editorHeight = "min(70vh, 760px)";
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [editorValue, setEditorValue] = useState(browser.kind === "file" ? browser.content : "");
	const [message, setMessage] = useState<{ text: string; kind: "success" | "error" } | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [pathInput, setPathInput] = useState(path);

	function showMessage(text: string, kind: "success" | "error") {
		setMessage({ text, kind });
		setTimeout(() => setMessage(null), 4000);
	}

	async function saveFile() {
		if (browser.kind !== "file") return;
		const url = environmentId
			? `/api/containers/${containerId}/files?environmentId=${encodeURIComponent(environmentId)}`
			: `/api/containers/${containerId}/files`;
		const response = await fetch(url, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ path: browser.path, content: editorValue }),
		});
		const payload = (await response.json()) as { error?: string };
		showMessage(
			response.ok ? "File saved." : payload.error || "Unable to save file.",
			response.ok ? "success" : "error",
		);
		if (response.ok) startTransition(() => router.refresh());
	}

	async function deletePath(targetPath: string) {
		const url = environmentId
			? `/api/containers/${containerId}/files?environmentId=${encodeURIComponent(environmentId)}`
			: `/api/containers/${containerId}/files`;
		const response = await fetch(url, {
			method: "DELETE",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ path: targetPath }),
		});
		const payload = (await response.json()) as { error?: string };
		showMessage(
			response.ok ? "Path removed." : payload.error || "Unable to delete path.",
			response.ok ? "success" : "error",
		);
		if (response.ok) {
			startTransition(() =>
				router.push(buildHref(containerId, path === targetPath ? "/" : path, environmentId)),
			);
		}
	}

	async function uploadFile(formData: FormData) {
		const url = environmentId
			? `/api/containers/${containerId}/files?environmentId=${encodeURIComponent(environmentId)}`
			: `/api/containers/${containerId}/files`;
		const response = await fetch(url, { method: "POST", body: formData });
		const payload = (await response.json()) as { error?: string };
		showMessage(
			response.ok ? "File uploaded." : payload.error || "Unable to upload file.",
			response.ok ? "success" : "error",
		);
		if (response.ok) startTransition(() => router.refresh());
	}

	const breadcrumbs = buildBreadcrumbs(browser.path);
	const parentPath =
		browser.path === "/" ? null : browser.path.split("/").slice(0, -1).join("/") || "/";
	const dirs = browser.kind === "directory" ? browser.entries.filter((e) => e.kind === "dir") : [];
	const files = browser.kind === "directory" ? browser.entries.filter((e) => e.kind !== "dir") : [];

	return (
		<Panel className="overflow-hidden">
			{/* Toolbar */}
			<div className="flex items-center gap-2 border-b border-default/8 px-3 py-2">
				{/* Breadcrumbs */}
				<nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto text-xs">
					{breadcrumbs.map((crumb, i) => (
						<span key={crumb.path} className="flex shrink-0 items-center gap-0.5">
							{i > 0 ? <ChevronRight className="h-3 w-3 text-muted/40" /> : null}
							{i === breadcrumbs.length - 1 ? (
								<span className="font-medium text-foreground">{crumb.label}</span>
							) : (
								<Link
									href={buildHref(containerId, crumb.path, environmentId)}
									className="text-muted transition-colors hover:text-foreground"
								>
									{crumb.label}
								</Link>
							)}
						</span>
					))}
				</nav>

				{/* Path input */}
				<form
					className="flex items-center gap-1.5"
					onSubmit={(event) => {
						event.preventDefault();
						router.push(buildHref(containerId, pathInput || "/", environmentId));
					}}
				>
					<input
						type="text"
						value={pathInput}
						onChange={(e) => setPathInput(e.target.value)}
						placeholder="/"
						className="h-7 w-40 rounded-md border border-default/12 bg-transparent px-2 font-mono text-xs text-foreground outline-none transition-colors placeholder:text-muted/50 focus:border-accent/40 sm:w-52"
					/>
					<Button type="submit" variant="outline" size="xs">
						Go
					</Button>
				</form>

				{/* Upload button (directory only) */}
				{browser.kind === "directory" ? (
					<>
						<input
							ref={fileInputRef}
							type="file"
							className="hidden"
							onChange={(e) => {
								const file = e.target.files?.[0];
								if (!file) return;
								const formData = new FormData();
								formData.append("path", browser.path);
								formData.append("file", file);
								void uploadFile(formData);
								e.target.value = "";
							}}
						/>
						<Button
							type="button"
							variant="outline"
							size="xs"
							onClick={() => fileInputRef.current?.click()}
							disabled={isPending}
						>
							<Upload className="h-3 w-3" />
							Upload
						</Button>
					</>
				) : null}
			</div>

			{/* Status message */}
			{message ? (
				<div
					className={`border-b px-3 py-1.5 text-xs ${
						message.kind === "success"
							? "border-emerald-500/10 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400"
							: "border-danger/10 bg-danger/5 text-danger"
					}`}
				>
					{message.text}
				</div>
			) : null}

			{/* Directory view */}
			{browser.kind === "directory" ? (
				<div className="divide-y divide-default/6">
					{/* Parent directory link */}
					{parentPath !== null ? (
						<Link
							href={buildHref(containerId, parentPath, environmentId)}
							className="group flex items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-foreground/[0.02]"
						>
							<ArrowUp className="h-3.5 w-3.5 text-muted/50 transition-colors group-hover:text-foreground" />
							<span className="text-muted transition-colors group-hover:text-foreground">..</span>
						</Link>
					) : null}

					{/* Directories first */}
					{dirs.map((entry) => {
						const nextPath =
							browser.path === "/"
								? `/${entry.name}`
								: `${browser.path.replace(/\/$/, "")}/${entry.name}`;
						return (
							<div
								key={`dir-${entry.name}`}
								className="group flex items-center gap-3 px-3 py-2 transition-colors hover:bg-foreground/[0.02]"
							>
								<Link
									href={buildHref(containerId, nextPath, environmentId)}
									className="flex min-w-0 flex-1 items-center gap-3"
								>
									{getFileIcon(entry.kind)}
									<span className="truncate text-sm font-medium transition-colors group-hover:text-foreground">
										{entry.name}
									</span>
								</Link>
								<button
									type="button"
									onClick={() => void deletePath(nextPath)}
									className="rounded p-1 text-muted/0 transition-all group-hover:text-muted hover:!text-danger"
									title="Remove"
								>
									<Trash2 className="h-3.5 w-3.5" />
								</button>
							</div>
						);
					})}

					{/* Then files */}
					{files.map((entry) => {
						const nextPath =
							browser.path === "/"
								? `/${entry.name}`
								: `${browser.path.replace(/\/$/, "")}/${entry.name}`;
						return (
							<div
								key={`file-${entry.name}`}
								className="group flex items-center gap-3 px-3 py-2 transition-colors hover:bg-foreground/[0.02]"
							>
								<Link
									href={buildHref(containerId, nextPath, environmentId)}
									className="flex min-w-0 flex-1 items-center gap-3"
								>
									{getFileIcon(entry.kind)}
									<span className="truncate text-sm text-muted transition-colors group-hover:text-foreground">
										{entry.name}
									</span>
								</Link>
								<button
									type="button"
									onClick={() => void deletePath(nextPath)}
									className="rounded p-1 text-muted/0 transition-all group-hover:text-muted hover:!text-danger"
									title="Remove"
								>
									<Trash2 className="h-3.5 w-3.5" />
								</button>
							</div>
						);
					})}

					{/* Empty state */}
					{browser.entries.length === 0 ? (
						<div className="px-3 py-8 text-center">
							<File className="mx-auto h-5 w-5 text-muted/30" />
							<p className="mt-2 text-xs text-muted">Empty directory</p>
						</div>
					) : null}
				</div>
			) : browser.kind === "file" ? (
				/* File editor view */
				<div>
					<div className="flex items-center justify-between border-b border-default/8 px-3 py-2">
						<div className="flex min-w-0 items-center gap-2">
							<FileText className="h-4 w-4 shrink-0 text-muted/60" />
							<span className="truncate font-mono text-xs text-muted">{browser.path}</span>
						</div>
						<div className="flex shrink-0 items-center gap-1.5">
							<Button
								type="button"
								variant="quietDanger"
								size="xs"
								onClick={() => void deletePath(browser.path)}
							>
								<Trash2 className="h-3 w-3" />
								Remove
							</Button>
							<Button type="button" size="xs" onClick={() => void saveFile()} disabled={isPending}>
								<Save className="h-3 w-3" />
								Save
							</Button>
						</div>
					</div>
					<CodeEditor
						value={editorValue}
						onChange={setEditorValue}
						language={browser.path.match(/\.(ya?ml)$/) ? "yaml" : "env"}
						minHeight="460px"
						maxHeight={editorHeight}
						height={editorHeight}
					/>
				</div>
			) : (
				<EmptyState
					title="Path unavailable"
					description="The selected path does not exist inside the container or could not be inspected."
					className="m-4"
				/>
			)}
		</Panel>
	);
}
