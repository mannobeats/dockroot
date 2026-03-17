import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { applyRuntimeBootstrap, loadEnvFiles } from "./bootstrap-runtime.mjs";

const SECRET_CONFIG = {
	"better-auth-secret": {
		stateKey: "betterAuthSecret",
		envName: "BETTER_AUTH_SECRET",
		bytes: 32,
		description: "Better Auth signing secret",
	},
	"internal-token": {
		stateKey: "tokenPepper",
		envName: "DOCKROOT_TOKEN_PEPPER",
		bytes: 32,
		description: "internal manager token",
	},
	"metrics-token": {
		stateKey: "metricsBearerToken",
		envName: "METRICS_BEARER_TOKEN",
		bytes: 32,
		description: "metrics bearer token",
	},
	"postgres-password": {
		stateKey: "postgresPassword",
		envName: "POSTGRES_PASSWORD",
		bytes: 24,
		description: "Postgres password",
	},
};

function randomSecret(bytes) {
	return randomBytes(bytes).toString("hex");
}

function readEnv(name) {
	const value = process.env[name];
	return typeof value === "string" ? value.trim() : "";
}

function defaultDataDir() {
	return readEnv("DOCKROOT_DATA_DIR") || path.join(process.cwd(), ".dockroot");
}

function parseArgs(argv) {
	const envFiles = [];
	const requestedSecrets = new Set();
	let dataDir = "";
	let rotateAll = false;
	let help = false;

	for (let index = 0; index < argv.length; index += 1) {
		const value = argv[index];
		if (value === "--help" || value === "-h") {
			help = true;
			continue;
		}
		if (value === "--env-file") {
			envFiles.push(argv[index + 1] || "");
			index += 1;
			continue;
		}
		if (value === "--data-dir") {
			dataDir = argv[index + 1] || "";
			index += 1;
			continue;
		}
		if (value === "--all") {
			rotateAll = true;
			continue;
		}
		if (value === "--secret") {
			const secretName = (argv[index + 1] || "").trim();
			if (!SECRET_CONFIG[secretName]) {
				throw new Error(
					`Unknown secret "${secretName}". Use one of: ${Object.keys(SECRET_CONFIG).join(", ")}`,
				);
			}
			requestedSecrets.add(secretName);
			index += 1;
		}
	}

	return {
		envFiles: envFiles.filter(Boolean),
		dataDir: dataDir.trim(),
		help,
		rotateAll,
		requestedSecrets,
	};
}

async function readJson(filePath, fallback) {
	try {
		return JSON.parse(await readFile(filePath, "utf8"));
	} catch {
		return fallback;
	}
}

async function main() {
	const { envFiles, dataDir, help, rotateAll, requestedSecrets } = parseArgs(process.argv.slice(2));
	if (help) {
		console.log("Usage: node scripts/rotate-runtime-secrets.mjs [--all] [--secret <name>] [--env-file <path>] [--data-dir <path>]");
		console.log("");
		console.log("Secrets:");
		for (const [secretName, config] of Object.entries(SECRET_CONFIG)) {
			console.log(`- ${secretName}: ${config.description}`);
		}
		console.log("");
		console.log("Defaults to rotating internal-token and metrics-token when no --secret flags are provided.");
		return;
	}

	const defaultEnvFiles = envFiles.length > 0 ? envFiles : [path.join(process.cwd(), ".env.local")];

	await loadEnvFiles(defaultEnvFiles);
	const preBootstrapOverrides = new Set(
		Object.values(SECRET_CONFIG)
			.map((config) => config.envName)
			.filter((envName) => Boolean(readEnv(envName))),
	);

	const resolvedDataDir = dataDir || defaultDataDir();
	const bootstrapDir = path.join(resolvedDataDir, "bootstrap");
	const secretStateFile = path.join(bootstrapDir, "runtime-secrets.json");
	const runtimeEnvFile = path.join(bootstrapDir, "runtime.env");
	const postgresPasswordFile = path.join(bootstrapDir, "postgres_password");
	const metricsTokenFile = path.join(bootstrapDir, "metrics_token");

	await applyRuntimeBootstrap({
		dataDir: resolvedDataDir,
		writeEnvFile: runtimeEnvFile,
		writePostgresPasswordFile: postgresPasswordFile,
		writeMetricsTokenFile: metricsTokenFile,
	});

	const secretState = await readJson(secretStateFile, {});
	const targets = rotateAll
		? Object.keys(SECRET_CONFIG)
		: requestedSecrets.size > 0
			? Array.from(requestedSecrets)
			: ["internal-token", "metrics-token"];

	const rotated = [];
	for (const secretName of targets) {
		const config = SECRET_CONFIG[secretName];
		const nextValue = randomSecret(config.bytes);
		secretState[config.stateKey] = nextValue;
		process.env[config.envName] = nextValue;
		rotated.push({
			secretName,
			description: config.description,
			envName: config.envName,
		});
	}

	await mkdir(bootstrapDir, { recursive: true });
	await writeFile(secretStateFile, `${JSON.stringify(secretState, null, 2)}\n`, "utf8");

	await applyRuntimeBootstrap({
		dataDir: resolvedDataDir,
		writeEnvFile: runtimeEnvFile,
		writePostgresPasswordFile: postgresPasswordFile,
		writeMetricsTokenFile: metricsTokenFile,
	});

	const overriddenSecrets = rotated.filter(({ envName }) => preBootstrapOverrides.has(envName));

	console.log(`Rotated ${rotated.length} Dockroot secret${rotated.length === 1 ? "" : "s"} in ${bootstrapDir}:`);
	for (const secret of rotated) {
		console.log(`- ${secret.secretName}: ${secret.description}`);
	}

	if (overriddenSecrets.length > 0) {
		console.log("");
		console.log("Warning: this process had explicit environment values loaded for some rotated secrets.");
		console.log("If your deployment sets those variables outside the bootstrap files, update that source too.");
		for (const secret of overriddenSecrets) {
			console.log(`- ${secret.envName}`);
		}
	}

	if (targets.includes("better-auth-secret")) {
		console.log("");
		console.log("Note: rotating BETTER_AUTH_SECRET invalidates existing auth sessions after restart.");
	}

	if (targets.includes("postgres-password")) {
		console.log("");
		console.log("Note: rotating POSTGRES_PASSWORD also requires the database service to use the updated password.");
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : "Failed to rotate runtime secrets.");
	process.exit(1);
});
