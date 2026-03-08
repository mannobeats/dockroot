import { NextResponse } from "next/server";
import { requireUserSession } from "@/lib/authorization";
import {
	deleteContainerPath,
	uploadContainerFile,
	writeContainerFile,
} from "@/lib/platform/docker";
import { requireAccessibleContainerForUser } from "@/lib/runtime-access";

export async function PUT(
	request: Request,
	{ params }: { params: Promise<{ containerId: string }> },
) {
	try {
		const auth = await requireUserSession(request.headers);
		const { containerId } = await params;
		await requireAccessibleContainerForUser({
			containerId,
			userId: auth.userId,
			role: auth.role,
		});
		const body = (await request.json()) as { path?: string; content?: string };

		if (!body.path) {
			return NextResponse.json({ error: "Path is required." }, { status: 400 });
		}

		const result = await writeContainerFile(containerId, body.path, body.content || "");
		return NextResponse.json({ ok: result.ok, output: result.stderr || result.stdout });
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Unable to save file." },
			{ status: 500 },
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
		await requireAccessibleContainerForUser({
			containerId,
			userId: auth.userId,
			role: auth.role,
		});
		const formData = await request.formData();
		const targetDirectory = String(formData.get("path") || "").trim();
		const file = formData.get("file");

		if (!targetDirectory || !(file instanceof File)) {
			return NextResponse.json({ error: "Path and file are required." }, { status: 400 });
		}

		const buffer = Buffer.from(await file.arrayBuffer());
		const result = await uploadContainerFile(containerId, targetDirectory, file.name, buffer);
		return NextResponse.json({ ok: result.ok, output: result.stderr || result.stdout });
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Unable to upload file." },
			{ status: 500 },
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
		await requireAccessibleContainerForUser({
			containerId,
			userId: auth.userId,
			role: auth.role,
		});
		const body = (await request.json()) as { path?: string };

		if (!body.path) {
			return NextResponse.json({ error: "Path is required." }, { status: 400 });
		}

		const result = await deleteContainerPath(containerId, body.path);
		return NextResponse.json({ ok: result.ok, output: result.stderr || result.stdout });
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Unable to delete path." },
			{ status: 500 },
		);
	}
}
