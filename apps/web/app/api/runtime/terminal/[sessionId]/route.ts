import { NextResponse } from "next/server";
import { requireUserSession } from "@/lib/authorization";
import {
	closeTerminalSessionForEnvironment,
	readTerminalSessionForEnvironment,
	resizeTerminalSessionForEnvironment,
	writeTerminalInputForEnvironment,
} from "@/lib/environment-runtime";

export const runtime = "nodejs";

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ sessionId: string }> },
) {
	try {
		const auth = await requireUserSession(request.headers);
		const { sessionId } = await params;
		const url = new URL(request.url);
		const environmentId = url.searchParams.get("environmentId") || undefined;
		const cursor = Number(url.searchParams.get("cursor") || "0");
		const waitMs = Number(url.searchParams.get("waitMs") || "0");
		const result = await readTerminalSessionForEnvironment(
			auth.userId,
			sessionId,
			environmentId,
			cursor,
			waitMs,
		);
		return NextResponse.json(result);
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Unable to read terminal session." },
			{ status: 500 },
		);
	}
}

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ sessionId: string }> },
) {
	try {
		const auth = await requireUserSession(request.headers);
		const { sessionId } = await params;
		const url = new URL(request.url);
		const environmentId = url.searchParams.get("environmentId") || undefined;
		const body = (await request.json()) as {
			type?: "input" | "resize";
			data?: string;
			cols?: number;
			rows?: number;
		};

		if (body.type === "resize") {
			const result = await resizeTerminalSessionForEnvironment({
				userId: auth.userId,
				environmentId,
				sessionId,
				cols: Number(body.cols || 120),
				rows: Number(body.rows || 36),
			});
			return NextResponse.json(result);
		}
		if (body.type !== "input") {
			return NextResponse.json({ error: "Unsupported terminal operation." }, { status: 400 });
		}

		const result = await writeTerminalInputForEnvironment({
			userId: auth.userId,
			environmentId,
			sessionId,
			data: String(body.data || "").slice(0, 8192),
		});
		return NextResponse.json(result);
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Unable to write terminal session." },
			{ status: 500 },
		);
	}
}

export async function DELETE(
	request: Request,
	{ params }: { params: Promise<{ sessionId: string }> },
) {
	try {
		const auth = await requireUserSession(request.headers);
		const { sessionId } = await params;
		const environmentId = new URL(request.url).searchParams.get("environmentId") || undefined;
		const result = await closeTerminalSessionForEnvironment(auth.userId, sessionId, environmentId);
		return NextResponse.json(result);
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Unable to close terminal session." },
			{ status: 500 },
		);
	}
}
