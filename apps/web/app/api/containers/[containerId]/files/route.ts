import { NextResponse } from "next/server";
import {
	deleteContainerPath,
	uploadContainerFile,
	writeContainerFile,
} from "@/lib/platform/docker";
import { getServerSession } from "@/lib/session";

async function requireSession() {
	const session = await getServerSession();

	if (!session?.user.id) {
		throw new Error("Unauthorized");
	}

	return session;
}

export async function PUT(
	request: Request,
	{ params }: { params: Promise<{ containerId: string }> },
) {
	try {
		await requireSession();
		const { containerId } = await params;
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
		await requireSession();
		const { containerId } = await params;
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
		await requireSession();
		const { containerId } = await params;
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
