import "server-only";

import crypto from "node:crypto";

function getEncryptionSecret() {
	const secret = process.env.DOCKROOT_TOKEN_PEPPER || process.env.BETTER_AUTH_SECRET || "";
	if (!secret) {
		throw new Error("Missing encryption secret. Set DOCKROOT_TOKEN_PEPPER or BETTER_AUTH_SECRET.");
	}
	return secret;
}

function deriveKey() {
	return crypto.createHash("sha256").update(getEncryptionSecret()).digest();
}

export function encryptSecret(value: string) {
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(), iv);
	const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
	const tag = cipher.getAuthTag();
	return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${ciphertext.toString("base64url")}`;
}

export function decryptSecret(payload: string) {
	const [version, ivEncoded, tagEncoded, ciphertextEncoded] = payload.split(":");
	if (version !== "v1" || !ivEncoded || !tagEncoded || !ciphertextEncoded) {
		throw new Error("Invalid encrypted secret payload.");
	}

	const decipher = crypto.createDecipheriv(
		"aes-256-gcm",
		deriveKey(),
		Buffer.from(ivEncoded, "base64url"),
	);
	decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
	const decrypted = Buffer.concat([
		decipher.update(Buffer.from(ciphertextEncoded, "base64url")),
		decipher.final(),
	]);
	return decrypted.toString("utf8");
}
