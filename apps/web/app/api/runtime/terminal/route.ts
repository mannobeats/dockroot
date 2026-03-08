import { NextResponse } from "next/server";
import { requireUserSession } from "@/lib/authorization";
import { createTerminalSessionForEnvironment } from "@/lib/environment-runtime";
import { requireAccessibleContainerForUser } from "@/lib/runtime-access";

export const runtime = "nodejs";

export async function POST(request: Request) {
	try {
		const auth = await requireUserSession(request.headers);
		const body = (await request.json()) as {
			target?: "container";
			containerId?: string;
			environmentId?: string;
			shell?: "sh" | "bash" | "ash" | "zsh" | "custom";
			customShell?: string;
			cols?: number;
			rows?: number;
		};

		if (!body.containerId) {
			return NextResponse.json({ error: "containerId is required." }, { status: 400 });
		}

		await requireAccessibleContainerForUser({
			containerId: body.containerId,
			userId: auth.userId,
			role: auth.role,
			environmentId: body.environmentId,
		});

		const result = await createTerminalSessionForEnvironment({
			userId: auth.userId,
			environmentId: body.environmentId,
			target: "container",
			containerId: body.containerId,
			shell: body.shell,
			customShell: body.customShell,
			cols: body.cols,
			rows: body.rows,
		});

		return NextResponse.json(result);
	} catch (error) {
		return NextResponse.json(
			{ error: "Unable to start terminal session." },
			{
				status:
					error instanceof Error &&
					(error.message === "Unauthorized" || error.message === "Forbidden")
						? 403
						: 500,
			},
		);
	}
}
