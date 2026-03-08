import { NextResponse } from "next/server";
import { requireUserSession } from "@/lib/authorization";
import {
	browseContainerPathForEnvironment,
	deleteContainerPathForEnvironment,
	uploadContainerFileForEnvironment,
	writeContainerFileForEnvironment,
} from "@/lib/environment-runtime";
import { requireAccessibleContainerForUser } from "@/lib/runtime-access";

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
			{ error: "Unable to browse files." },
			{ status: 500 },
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
			{ error: "Unable to save file." },
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
		const environmentId = new URL(request.url).searchParams.get("environmentId") || undefined;
		await requireAccessibleContainerForUser({
			containerId,
			userId: auth.userId,
			role: auth.role,
			environmentId,
		});
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
			{ error: "Unable to upload file." },
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
		const environmentId = new URL(request.url).searchParams.get("environmentId") || undefined;
		await requireAccessibleContainerForUser({
			containerId,
			userId: auth.userId,
			role: auth.role,
			environmentId,
		});
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
			{ error: "Unable to delete path." },
			{ status: 500 },
		);
	}
}
