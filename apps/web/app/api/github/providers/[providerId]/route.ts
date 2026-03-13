import { NextResponse } from "next/server";
import { requirePrivilegedSession } from "@/lib/authorization";
import { deleteGitHubProvider } from "@/lib/platform";

export async function DELETE(
	_request: Request,
	{ params }: { params: Promise<{ providerId: string }> },
) {
	let userId = "";
	try {
		const auth = await requirePrivilegedSession();
		userId = auth.userId;
	} catch {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { providerId } = await params;
	if (!providerId?.trim()) {
		return NextResponse.json({ error: "Provider id is required." }, { status: 400 });
	}

	try {
		const result = await deleteGitHubProvider(userId, providerId.trim());
		return NextResponse.json({
			ok: true,
			remoteUninstalled: result.remoteUninstalled,
			remoteFailures: result.remoteFailures,
		});
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Failed to delete provider." },
			{ status: 400 },
		);
	}
}
