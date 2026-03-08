"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CodeEditor } from "@/components/code-editor";

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

export function ContainerFileBrowser({
	containerId,
	path,
	browser,
	environmentId,
}: ContainerFileBrowserProps & { environmentId?: string }) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [editorValue, setEditorValue] = useState(browser.kind === "file" ? browser.content : "");
	const [message, setMessage] = useState<string | null>(null);

	async function saveFile() {
		if (browser.kind !== "file") {
			return;
		}

		const url = environmentId
			? `/api/containers/${containerId}/files?environmentId=${encodeURIComponent(environmentId)}`
			: `/api/containers/${containerId}/files`;
		const response = await fetch(url, {
			method: "PUT",
			headers: {
				"content-type": "application/json",
			},
			body: JSON.stringify({
				path: browser.path,
				content: editorValue,
			}),
		});
		const payload = (await response.json()) as { error?: string };

		setMessage(
			response.ok ? "File saved inside the container." : payload.error || "Unable to save file.",
		);
		if (response.ok) {
			startTransition(() => router.refresh());
		}
	}

	async function deletePath(targetPath: string) {
		const url = environmentId
			? `/api/containers/${containerId}/files?environmentId=${encodeURIComponent(environmentId)}`
			: `/api/containers/${containerId}/files`;
		const response = await fetch(url, {
			method: "DELETE",
			headers: {
				"content-type": "application/json",
			},
			body: JSON.stringify({
				path: targetPath,
			}),
		});
		const payload = (await response.json()) as { error?: string };
		setMessage(
			response.ok ? "Path removed from the container." : payload.error || "Unable to delete path.",
		);
		if (response.ok) {
			startTransition(() =>
				router.push(
					`/dashboard/containers/${containerId}?path=${encodeURIComponent(path === targetPath ? "/" : path)}${environmentId ? `&environment=${encodeURIComponent(environmentId)}` : ""}`,
				),
			);
		}
	}

	async function uploadFile(formData: FormData) {
		const url = environmentId
			? `/api/containers/${containerId}/files?environmentId=${encodeURIComponent(environmentId)}`
			: `/api/containers/${containerId}/files`;
		const response = await fetch(url, {
			method: "POST",
			body: formData,
		});
		const payload = (await response.json()) as { error?: string };
		setMessage(
			response.ok ? "File uploaded into the container." : payload.error || "Unable to upload file.",
		);
		if (response.ok) {
			startTransition(() => router.refresh());
		}
	}

	return (
		<section className="rounded-xl border border-default/10 bg-surface p-5">
			<div className="flex items-center justify-between gap-4">
				<h2 className="text-lg font-semibold tracking-tight">Container files</h2>
				<form
					className="flex gap-2"
					onSubmit={(event) => {
						event.preventDefault();
						const form = event.currentTarget;
						const formData = new FormData(form);
						const nextPath = String(formData.get("path") || "/");
						router.push(
							`/dashboard/containers/${containerId}?path=${encodeURIComponent(nextPath)}${environmentId ? `&environment=${encodeURIComponent(environmentId)}` : ""}`,
						);
					}}
				>
					<input
						type="text"
						name="path"
						defaultValue={path}
						placeholder="/"
						className="h-10 rounded-xl border border-default/10 bg-background px-3 text-sm outline-none transition-colors focus:border-accent"
					/>
					<button
						type="submit"
						className="inline-flex h-10 items-center justify-center rounded-xl bg-accent px-4 text-sm font-medium text-white"
					>
						Browse
					</button>
				</form>
			</div>
			<div className="mt-4 rounded-xl border border-default/10 bg-background/60 p-4">
				<p className="text-xs text-muted">Path</p>
				<p className="mt-2 font-mono text-sm">{browser.path}</p>
			</div>
			{message ? <p className="mt-4 text-sm text-muted">{message}</p> : null}

			{browser.kind === "directory" ? (
				<div className="mt-4 space-y-3">
					<form
						className="flex flex-wrap items-center gap-3 rounded-xl border border-default/10 bg-background/60 p-4"
						onSubmit={(event) => {
							event.preventDefault();
							void uploadFile(new FormData(event.currentTarget));
						}}
					>
						<input type="hidden" name="path" value={browser.path} />
						<input
							type="file"
							name="file"
							required
							className="block text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-accent/10 file:px-3 file:py-2 file:text-accent"
						/>
						<button
							type="submit"
							disabled={isPending}
							className="inline-flex h-10 items-center justify-center rounded-xl border border-default/20 px-4 text-sm font-medium"
						>
							Upload
						</button>
					</form>
					{browser.path !== "/" ? (
						<Link
							href={`/dashboard/containers/${containerId}?path=${encodeURIComponent(browser.path.split("/").slice(0, -1).join("/") || "/")}${environmentId ? `&environment=${encodeURIComponent(environmentId)}` : ""}`}
							className="block rounded-xl border border-default/10 bg-background/60 px-4 py-3 text-sm font-medium"
						>
							..
						</Link>
					) : null}
					{browser.entries.map((entry) => {
						const nextPath =
							browser.path === "/"
								? `/${entry.name}`
								: `${browser.path.replace(/\/$/, "")}/${entry.name}`;
						return (
							<div
								key={`${entry.kind}-${entry.name}`}
								className="flex items-center justify-between gap-3 rounded-xl border border-default/10 bg-background/60 px-4 py-3"
							>
								<Link
									href={`/dashboard/containers/${containerId}?path=${encodeURIComponent(nextPath)}${environmentId ? `&environment=${encodeURIComponent(environmentId)}` : ""}`}
									className="min-w-0 flex-1"
								>
									<p className="truncate font-medium">{entry.name}</p>
									<p className="mt-1 text-xs text-muted">{entry.kind}</p>
								</Link>
								<button
									type="button"
									onClick={() => void deletePath(nextPath)}
									className="inline-flex h-9 items-center justify-center rounded-lg border border-danger/30 bg-danger/10 px-3 text-xs font-medium text-danger"
								>
									Delete
								</button>
							</div>
						);
					})}
				</div>
			) : browser.kind === "file" ? (
				<div className="mt-4 overflow-hidden rounded-xl border border-default/10">
					<div className="flex items-center justify-between border-b border-default/10 px-4 py-3">
						<p className="text-sm font-semibold">{browser.path}</p>
						<div className="flex gap-2">
							<button
								type="button"
								onClick={() => void deletePath(browser.path)}
								className="inline-flex h-9 items-center justify-center rounded-lg border border-danger/30 bg-danger/10 px-3 text-xs font-medium text-danger"
							>
								Delete
							</button>
							<button
								type="button"
								onClick={() => void saveFile()}
								disabled={isPending}
								className="inline-flex h-9 items-center justify-center rounded-lg bg-accent px-3 text-xs font-medium text-white"
							>
								Save
							</button>
						</div>
					</div>
					<CodeEditor
						value={editorValue}
						onChange={setEditorValue}
						language={browser.path.match(/\.(ya?ml)$/) ? "yaml" : "env"}
						minHeight="460px"
					/>
				</div>
			) : (
				<div className="mt-4 rounded-xl border border-dashed border-default/20 bg-background/60 p-6 text-sm text-muted">
					The selected path does not exist inside the container or could not be inspected.
				</div>
			)}
		</section>
	);
}
