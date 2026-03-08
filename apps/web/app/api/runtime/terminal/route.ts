import { NextResponse } from "next/server";
import { isPrivilegedRole, requireUserSession } from "@/lib/authorization";
import { createTerminalSessionForEnvironment } from "@/lib/environment-runtime";
import { requireAccessibleContainerForUser } from "@/lib/runtime-access";

export const runtime = "nodejs";

export async function POST(request: Request) {
	try {
		const auth = await requireUserSession(request.headers);
		const body = (await request.json()) as {
			target?: "host" | "container";
			containerId?: string;
			environmentId?: string;
			cols?: number;
			rows?: number;
		};

		if (body.target === "host" && !isPrivilegedRole(auth.role)) {
			return NextResponse.json(
				{ error: "Host shell access is restricted to administrators." },
				{ status: 403 },
			);
		}

		if (body.target === "container") {
			if (!body.containerId) {
				return NextResponse.json({ error: "containerId is required." }, { status: 400 });
			}

			await requireAccessibleContainerForUser({
				containerId: body.containerId,
				userId: auth.userId,
				role: auth.role,
				environmentId: body.environmentId,
			});
		}

		const result = await createTerminalSessionForEnvironment({
			userId: auth.userId,
			environmentId: body.environmentId,
			target: body.target || "host",
			containerId: body.containerId,
			cols: body.cols,
			rows: body.rows,
		});

		return NextResponse.json(result);
	} catch (error) {
		return NextResponse.json(
			{ error: "Unable to start terminal session." },
			{
				status:
					error instanceof Error && (error.message === "Unauthorized" || error.message === "Forbidden")
						? 403
						: 500,
			},
		);
	}
}
