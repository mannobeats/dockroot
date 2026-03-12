import { NextResponse } from "next/server";
import { listGitHubProviders } from "@/lib/platform";
import { getServerSession } from "@/lib/session";

export async function GET() {
	const session = await getServerSession();
	if (!session?.user.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const providers = await listGitHubProviders(session.user.id);
	return NextResponse.json({ providers });
}
