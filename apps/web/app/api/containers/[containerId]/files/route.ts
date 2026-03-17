import { NextResponse } from "next/server";
import { isPrivilegedRole, requireUserSession } from "@/lib/authorization";
import {
	browseContainerPathForEnvironment,
	deleteContainerPathForEnvironment,
	uploadContainerFileForEnvironment,
	writeContainerFileForEnvironment,
} from "@/lib/environment-runtime";
import { requireAccessibleContainerForUser } from "@/lib/runtime-access";

function fileApiErrorStatus(error: unknown) {
	if (!(error instanceof Error)) {
		return 500;
	}

	if (error.message === "Unauthorized" || error.message === "Forbidden") {
		return 403;
	}
	if (error.message === "Environment not found.") {
		return 404;
	}
	if (
		error.message.includes("Container path is required") ||
		error.message.includes("Container paths must be absolute") ||
		error.message.includes("Refusing to target the container root directory") ||
		error.message.includes("Refusing to modify container")
	) {
		return 400;
	}

	return 500;
}

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ containerId: string }> },
) {
	try {
		const auth = await requireUserSession(request.headers);
		const { containerId } = await params;
		const environmentId = new URL(request.url).searchParams.get("environmentId") || undefined;
		await requireAccessibleContainerForUser({
			containerId,
			userId: auth.userId,
			role: auth.role,
			environmentId,
		});
		const path = new URL(request.url).searchParams.get("path") || "/";
		const result = await browseContainerPathForEnvironment(
			auth.userId,
			containerId,
			path,
			environmentId,
		);
		return NextResponse.json(result.browser);
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Unable to browse files." },
			{ status: fileApiErrorStatus(error) },
		);
	}
}

export async function PUT(
	request: Request,
	{ params }: { params: Promise<{ containerId: string }> },
) {
	try {
		const auth = await requireUserSession(request.headers);
		const { containerId } = await params;
		const environmentId = new URL(request.url).searchParams.get("environmentId") || undefined;
		await requireAccessibleContainerForUser({
			containerId,
			userId: auth.userId,
			role: auth.role,
			environmentId,
		});
		if (!isPrivilegedRole(auth.role)) {
			return NextResponse.json(
				{ error: "Privileged access is required to modify container files." },
				{ status: 403 },
			);
		}
		const body = (await request.json()) as { path?: string; content?: string };

		if (!body.path) {
			return NextResponse.json({ error: "Path is required." }, { status: 400 });
		}

		const result = await writeContainerFileForEnvironment(
			auth.userId,
			containerId,
			body.path,
			body.content || "",
			environmentId,
		);
		return NextResponse.json({ ok: result.ok, output: result.stderr || result.stdout });
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Unable to save file." },
			{ status: fileApiErrorStatus(error) },
		);
	}
}

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ containerId: string }> },
) {
	try {
		const auth = await requireUserSession(request.headers);
		const { containerId } = await params;
		const environmentId = new URL(request.url).searchParams.get("environmentId") || undefined;
		await requireAccessibleContainerForUser({
			containerId,
			userId: auth.userId,
			role: auth.role,
			environmentId,
		});
		if (!isPrivilegedRole(auth.role)) {
			return NextResponse.json(
				{ error: "Privileged access is required to modify container files." },
				{ status: 403 },
			);
		}
		const formData = await request.formData();
		const targetDirectory = String(formData.get("path") || "").trim();
		const file = formData.get("file");

		if (!targetDirectory || !(file instanceof File)) {
			return NextResponse.json({ error: "Path and file are required." }, { status: 400 });
		}

		const buffer = Buffer.from(await file.arrayBuffer());
		const result = await uploadContainerFileForEnvironment(
			auth.userId,
			containerId,
			targetDirectory,
			file.name,
			buffer,
			environmentId,
		);
		return NextResponse.json({ ok: result.ok, output: result.stderr || result.stdout });
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Unable to upload file." },
			{ status: fileApiErrorStatus(error) },
		);
	}
}

export async function DELETE(
	request: Request,
	{ params }: { params: Promise<{ containerId: string }> },
) {
	try {
		const auth = await requireUserSession(request.headers);
		const { containerId } = await params;
		const environmentId = new URL(request.url).searchParams.get("environmentId") || undefined;
		await requireAccessibleContainerForUser({
			containerId,
			userId: auth.userId,
			role: auth.role,
			environmentId,
		});
		if (!isPrivilegedRole(auth.role)) {
			return NextResponse.json(
				{ error: "Privileged access is required to modify container files." },
				{ status: 403 },
			);
		}
		const body = (await request.json()) as { path?: string };

		if (!body.path) {
			return NextResponse.json({ error: "Path is required." }, { status: 400 });
		}

		const result = await deleteContainerPathForEnvironment(
			auth.userId,
			containerId,
			body.path,
			environmentId,
		);
		return NextResponse.json({ ok: result.ok, output: result.stderr || result.stdout });
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Unable to delete path." },
			{ status: fileApiErrorStatus(error) },
		);
	}
}
