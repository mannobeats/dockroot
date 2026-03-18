import crypto from "node:crypto";
import { listGitHubProviderConfigs } from "./provider";

export async function verifyGitHubWebhookSignature(
	rawBody: string,
	signatureHeader: string | null,
) {
	if (!signatureHeader) {
		return {
			valid: false,
			providerId: null as string | null,
		};
	}

	const providers = await listGitHubProviderConfigs();
	for (const provider of providers) {
		const secret = provider.webhookSecret;
		if (!secret) {
			continue;
		}

		const expected = `sha256=${crypto.createHmac("sha256", secret).update(rawBody).digest("hex")}`;
		if (signatureHeader.length !== expected.length) {
			continue;
		}

		if (crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected))) {
			return {
				valid: true,
				providerId: provider.id,
			};
		}
	}

	return {
		valid: false,
		providerId: null as string | null,
	};
}
