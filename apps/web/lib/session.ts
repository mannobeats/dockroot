import "server-only";

import { auth } from "@dockroot/auth";
import { headers } from "next/headers";

export async function getServerSession() {
	return auth.api.getSession({
		headers: await headers(),
	});
}
