#!/usr/bin/env bash
# Dockroot Uninstaller
# One-liner: curl -fsSL https://raw.githubusercontent.com/mannobeats/dockroot/main/uninstall.sh | sudo bash
set -euo pipefail

DOCKROOT_INSTALL_DIR="${DOCKROOT_INSTALL_DIR:-/opt/dockroot}"
DOCKROOT_SERVICE_NAME="${DOCKROOT_SERVICE_NAME:-dockroot}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this uninstall script as root or with sudo."
  exit 1
fi

if [ ! -r /dev/tty ] || [ ! -w /dev/tty ]; then
  echo "A terminal is required for confirmation."
  exit 1
fi

COMPOSE_FILE="${DOCKROOT_INSTALL_DIR}/docker-compose.yaml"
ENV_FILE="${DOCKROOT_INSTALL_DIR}/.env"
LOCAL_UNINSTALLER="${DOCKROOT_INSTALL_DIR}/uninstall.sh"

if [ ! -f "${COMPOSE_FILE}" ]; then
  echo "Dockroot compose file was not found at ${COMPOSE_FILE}."
  echo "Set DOCKROOT_INSTALL_DIR if Dockroot is installed elsewhere."
  exit 1
fi

echo ""
echo "This will permanently remove Dockroot from this machine."
echo "Install directory: ${DOCKROOT_INSTALL_DIR}"
echo "Docker resources: containers, networks, and named volumes from this Dockroot stack"
echo ""
read -rp "Type 'uninstall' to continue: " confirm </dev/tty
if [ "${confirm}" != "uninstall" ]; then
  echo "Uninstall cancelled."
  exit 0
fi

if command -v systemctl >/dev/null 2>&1; then
  systemctl disable --now "${DOCKROOT_SERVICE_NAME}.service" >/dev/null 2>&1 || true
  rm -f "/etc/systemd/system/${DOCKROOT_SERVICE_NAME}.service"
  systemctl daemon-reload >/dev/null 2>&1 || true
fi

cd "${DOCKROOT_INSTALL_DIR}"

if docker compose version >/dev/null 2>&1; then
  docker compose -f "${COMPOSE_FILE}" down -v --remove-orphans || true
elif command -v docker-compose >/dev/null 2>&1; then
  docker-compose -f "${COMPOSE_FILE}" down -v --remove-orphans || true
else
  echo "Docker Compose was not found. Skipping compose shutdown."
fi

rm -f "${ENV_FILE}" "${COMPOSE_FILE}" "${LOCAL_UNINSTALLER}"
rmdir "${DOCKROOT_INSTALL_DIR}" >/dev/null 2>&1 || true

echo ""
echo "Dockroot has been removed from this machine."
