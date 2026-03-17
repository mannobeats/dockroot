import { spawn } from "node:child_process";
import path from "node:path";
import { applyRuntimeBootstrap, loadEnvFiles } from "./bootstrap-runtime.mjs";

function parseArgs(argv) {
	const envFiles = [];
	let commandIndex = argv.indexOf("--");
	if (commandIndex === -1) {
		commandIndex = argv.length;
	}

	for (let index = 0; index < commandIndex; index += 1) {
		if (argv[index] === "--env-file") {
			envFiles.push(argv[index + 1] || "");
			index += 1;
		}
	}

	return {
		envFiles: envFiles.filter(Boolean),
		command: argv.slice(commandIndex + 1),
	};
}

async function main() {
	const { envFiles, command } = parseArgs(process.argv.slice(2));
	if (!command.length) {
		throw new Error("A command is required after `--`.");
	}

	const defaultEnvFiles = envFiles.length ? envFiles : [path.join(process.cwd(), ".env.local")];
	await loadEnvFiles(defaultEnvFiles);
	await applyRuntimeBootstrap({
		writeEnvFile: path.join(process.env.DOCKROOT_DATA_DIR || path.join(process.cwd(), ".dockroot"), "runtime.env"),
		writePostgresPasswordFile: path.join(
			process.env.DOCKROOT_DATA_DIR || path.join(process.cwd(), ".dockroot"),
			"bootstrap",
			"postgres_password",
		),
	});

	const child = spawn(command[0], command.slice(1), {
		stdio: "inherit",
		env: process.env,
		shell: false,
	});

	child.on("exit", (code, signal) => {
		if (signal) {
			process.kill(process.pid, signal);
			return;
		}
		process.exit(code ?? 0);
	});
}

main();
