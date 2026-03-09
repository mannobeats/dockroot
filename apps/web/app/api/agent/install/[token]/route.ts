import { NextResponse } from "next/server";
import { requireUserSession } from "@/lib/authorization";
import { getEnvironmentById, getInstallCommand } from "@/lib/platform";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
	const auth = await requireUserSession(request.headers);
	const { token: environmentId } = await params;
	const environment = await getEnvironmentById(environmentId, auth.userId);

	if (!environment?.agent[0]) {
		return new NextResponse("Environment not found", { status: 404 });
	}

	const managerUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
	const installCommand = await getInstallCommand(environment.id, auth.userId);

	const script = `#!/usr/bin/env bash
set -euo pipefail

if [ "\${EUID}" -ne 0 ]; then
  echo "Run this installer with sudo or as root."
  exit 1
fi

MANAGER_URL="${managerUrl}"
REGISTRATION_TOKEN="${installCommand.registrationToken}"
INSTALL_ROOT="/opt/dockroot-agent"
BIN_PATH="/usr/local/bin/dockroot-agent"
CONFIG_PATH="\${INSTALL_ROOT}/agent.env"

mkdir -p "\${INSTALL_ROOT}/stacks"

echo "Installing Docker prerequisites check..."
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker CLI is required on the target server."
  exit 1
fi

HOSTNAME_VALUE="$(hostname)"
OS_VALUE="$(uname -s)"
ARCH_VALUE="$(uname -m)"
DOCKER_VERSION="$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo unknown)"

REGISTER_RESPONSE="$(curl -fsSL -X POST "\${MANAGER_URL}/api/agent/register" \\
  -H 'content-type: application/json' \\
  -d "{\\"registrationToken\\":\\"${installCommand.registrationToken}\\",\\"hostname\\":\\"\${HOSTNAME_VALUE}\\",\\"operatingSystem\\":\\"\${OS_VALUE}\\",\\"architecture\\":\\"\${ARCH_VALUE}\\",\\"dockerVersion\\":\\"\${DOCKER_VERSION}\\"}")"

printf '%s\n' "\${REGISTER_RESPONSE}" > "\${CONFIG_PATH}"
echo "REGISTRATION_TOKEN=\${REGISTRATION_TOKEN}" >> "\${CONFIG_PATH}"
echo "INSTALL_ROOT=\${INSTALL_ROOT}" >> "\${CONFIG_PATH}"

cat > "\${BIN_PATH}" <<'AGENT'
#!/usr/bin/env bash
set -euo pipefail

source /opt/dockroot-agent/agent.env

heartbeat() {
  curl -fsSL -X POST "\${MANAGER_URL}/api/agent/heartbeat" \\
    -H "Authorization: Bearer \${AGENT_TOKEN}" >/dev/null
}

poll_job() {
  curl -fsSL "\${MANAGER_URL}/api/agent/jobs/next" \\
    -H "Authorization: Bearer \${AGENT_TOKEN}"
}

report_result() {
  local deployment_id="$1"
  local status="$2"
  local log_file="$3"

  curl -fsSL -X POST "\${MANAGER_URL}/api/agent/jobs/\${deployment_id}/complete?status=\${status}" \\
    -H "Authorization: Bearer \${AGENT_TOKEN}" \\
    -H "content-type: text/plain; charset=utf-8" \\
    --data-binary "@\${log_file}" >/dev/null
}

run_job() {
  local job_file
  job_file="$(mktemp)"
  local log_file
  log_file="$(mktemp)"

  poll_job > "\${job_file}"
  source "\${job_file}"
  rm -f "\${job_file}"

  if [ -z "\${JOB_ID:-}" ]; then
    return 0
  fi

  local stack_dir="\${INSTALL_ROOT}/stacks/\${STACK_SLUG}"
  mkdir -p "\${stack_dir}"
  printf '%s' "\${COMPOSE_B64}" | base64 --decode > "\${stack_dir}/compose.yaml"
  printf '%s' "\${ENV_B64:-}" | base64 --decode > "\${stack_dir}/.env"

  local status="succeeded"
  if [ "\${OPERATION}" = "destroy" ]; then
    if ! docker compose -p "\${STACK_SLUG}" --env-file "\${stack_dir}/.env" -f "\${stack_dir}/compose.yaml" down --remove-orphans >"\${log_file}" 2>&1; then
      status="failed"
    fi
  else
    if ! docker compose -p "\${STACK_SLUG}" --env-file "\${stack_dir}/.env" -f "\${stack_dir}/compose.yaml" up -d --remove-orphans >"\${log_file}" 2>&1; then
      status="failed"
    fi
  fi

  report_result "\${JOB_ID}" "\${status}" "\${log_file}"
  rm -f "\${log_file}"
}

while true; do
  heartbeat || true
  run_job || true
  sleep 10
done
AGENT

chmod +x "\${BIN_PATH}"

cat > /etc/systemd/system/dockroot-agent.service <<SERVICE
[Unit]
Description=Dockroot Agent
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
ExecStart=\${BIN_PATH}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable --now dockroot-agent.service

echo "Dockroot agent installed for environment: ${environment.name}"
echo "Manager URL: \${MANAGER_URL}"
`;

	return new NextResponse(script, {
		headers: {
			"content-type": "text/x-shellscript; charset=utf-8",
			"content-disposition": `inline; filename="dockroot-agent-install-${environment.slug}.sh"`,
		},
	});
}
