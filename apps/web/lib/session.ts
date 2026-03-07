import "server-only";

import { auth } from "@lab-starter/auth";
import { headers } from "next/headers";

export async function getServerSession() {
	return auth.api.getSession({
		headers: await headers(),
	});
}
