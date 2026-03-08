import { NextResponse } from "next/server";
import { claimNextDeployment } from "@/lib/platform";

export const runtime = "nodejs";

function getBearerToken(request: Request) {
	const authHeader = request.headers.get("authorization");
	if (!authHeader?.startsWith("Bearer ")) {
		return null;
	}
	return authHeader.slice("Bearer ".length);
}

export async function GET(request: Request) {
	const token = getBearerToken(request);

	if (!token) {
		return new NextResponse("Missing bearer token", { status: 401 });
	}

	try {
		const job = await claimNextDeployment(token);

		if (!job) {
			return new NextResponse("JOB_ID=\n", {
				headers: {
					"content-type": "text/plain; charset=utf-8",
				},
			});
		}

		return new NextResponse(
			`JOB_ID=${job.id}\nSTACK_SLUG=${job.stackSlug}\nSTACK_NAME=${Buffer.from(job.stackName).toString("base64")}\nSOURCE_TYPE=${job.sourceType}\nSOURCE_COMMIT_SHA=${job.sourceCommitSha || ""}\nCOMPOSE_PATH=${job.composePath || ""}\nENV_PATH=${job.envPath || ""}\nOPERATION=${job.operation}\nCOMPOSE_B64=${Buffer.from(job.composeYaml).toString("base64")}\nENV_B64=${Buffer.from(job.envFileContent || "").toString("base64")}\n`,
			{
				headers: {
					"content-type": "text/plain; charset=utf-8",
				},
			},
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unable to fetch jobs";
		return new NextResponse(message, { status: 401 });
	}
}
