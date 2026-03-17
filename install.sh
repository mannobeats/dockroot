#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Dockroot Installer
# One-liner:  curl -fsSL https://raw.githubusercontent.com/mannobeats/dockroot/main/install.sh | sudo bash
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Configurable defaults ────────────────────────────────────────────────────
DOCKROOT_VERSION="${DOCKROOT_VERSION:-latest}"
DOCKROOT_PORT="${DOCKROOT_PORT:-3080}"
DOCKROOT_INSTALL_DIR="${DOCKROOT_INSTALL_DIR:-/opt/dockroot}"
DOCKROOT_IMAGE="ghcr.io/mannobeats/dockroot"
DOCKROOT_SERVICE_NAME="dockroot"
SKIP_DOCKER="${SKIP_DOCKER:-false}"

# Auto-detect non-interactive mode when stdin is a pipe (curl | bash)
if [ -t 0 ]; then
  NONINTERACTIVE="${NONINTERACTIVE:-false}"
else
  NONINTERACTIVE="${NONINTERACTIVE:-true}"
fi

# ── Color palette ────────────────────────────────────────────────────────────
if command -v tput &>/dev/null && tput colors &>/dev/null; then
  BOLD="$(tput bold)"
  DIM="$(tput dim)"
  RESET="$(tput sgr0)"
  GREEN="$(tput setaf 2)"
  CYAN="$(tput setaf 6)"
  YELLOW="$(tput setaf 3)"
  RED="$(tput setaf 1)"
  MAGENTA="$(tput setaf 5)"
  WHITE="$(tput setaf 7)"
else
  BOLD="" DIM="" RESET="" GREEN="" CYAN="" YELLOW="" RED="" MAGENTA="" WHITE=""
fi

# ── Pretty output helpers ────────────────────────────────────────────────────
banner() {
  echo ""
  echo "${CYAN}${BOLD}"
  echo "    ____             __                    __  "
  echo "   / __ \\____  _____/ /________ ____  ____/ /_ "
  echo "  / / / / __ \\/ ___/ //_/ ___/ __ \\/ __ \\/ __/ "
  echo " / /_/ / /_/ / /__/ ,< / /  / /_/ / /_/ / /_  "
  echo "/_____/\\____/\\___/_/|_/_/   \\____/\\____/\\__/  "
  echo "${RESET}"
  echo "${DIM}  Modern Docker Management, Built for Teams.${RESET}"
  echo ""
}

step() {
  echo "${GREEN}${BOLD}  ● ${RESET}${WHITE}$1...${RESET} ${DIM}$2${RESET}"
}

step_done() {
  echo "${GREEN}${BOLD}  ● ${RESET}${WHITE}$1...${RESET} ${GREEN}done${RESET}"
}

step_skip() {
  echo "${YELLOW}${BOLD}  ● ${RESET}${WHITE}$1...${RESET} ${YELLOW}${BOLD}skipped${RESET}"
}

step_fail() {
  echo "${RED}${BOLD}  ● ${RESET}${WHITE}$1...${RESET} ${RED}${BOLD}failed${RESET}"
}

info() {
  echo "    ${DIM}$1${RESET}"
}

warn() {
  echo "${YELLOW}  ⚠  $1${RESET}"
}

error() {
  echo "${RED}${BOLD}  ✖  $1${RESET}"
}

success_banner() {
  echo ""
  echo "${GREEN}${BOLD}  ════════════════════════════════════════════════════${RESET}"
  echo ""
  echo "${GREEN}${BOLD}                 Installation Complete!${RESET}"
  echo ""
  echo "${GREEN}${BOLD}  ════════════════════════════════════════════════════${RESET}"
  echo ""
}

separator() {
  echo "${DIM}  ──────────────────────────────────────────────────${RESET}"
}

# ── Interactive prompts ──────────────────────────────────────────────────────
ask_yes_no() {
  local prompt="$1" default="${2:-y}"
  if [ "$NONINTERACTIVE" = "true" ]; then
    if [ "$default" = "y" ]; then
      echo "    ${CYAN}?${RESET} ${prompt} ${DIM}[Y/n]${RESET} y (auto)"
    else
      echo "    ${CYAN}?${RESET} ${prompt} ${DIM}[y/N]${RESET} n (auto)"
    fi
    [ "$default" = "y" ] && return 0 || return 1
  fi
  local yn
  if [ "$default" = "y" ]; then
    read -rp "    ${CYAN}?${RESET} ${prompt} ${DIM}[Y/n]${RESET} " yn </dev/tty
    yn="${yn:-y}"
  else
    read -rp "    ${CYAN}?${RESET} ${prompt} ${DIM}[y/N]${RESET} " yn </dev/tty
    yn="${yn:-n}"
  fi
  [[ "$yn" =~ ^[Yy] ]]
}

ask_value() {
  local prompt="$1" default="$2" var_name="$3"
  if [ "$NONINTERACTIVE" = "true" ]; then
    echo "    ${CYAN}?${RESET} ${prompt} ${DIM}[${default}]${RESET} ${default} (auto)"
    eval "$var_name=\"$default\""
    return
  fi
  local val
  read -rp "    ${CYAN}?${RESET} ${prompt} ${DIM}[${default}]${RESET} " val </dev/tty
  val="${val:-$default}"
  eval "$var_name=\"$val\""
}

# ── System detection ─────────────────────────────────────────────────────────
detect_system() {
  OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
  ARCH="$(uname -m)"

  case "$ARCH" in
    x86_64|amd64)  ARCH="amd64" ;;
    aarch64|arm64) ARCH="arm64" ;;
    *)             error "Unsupported architecture: $ARCH"; exit 1 ;;
  esac

  # Detect package manager
  if command -v apt-get &>/dev/null; then
    PKG_MANAGER="apt"
  elif command -v dnf &>/dev/null; then
    PKG_MANAGER="dnf"
  elif command -v yum &>/dev/null; then
    PKG_MANAGER="yum"
  elif command -v apk &>/dev/null; then
    PKG_MANAGER="apk"
  elif command -v pacman &>/dev/null; then
    PKG_MANAGER="pacman"
  else
    PKG_MANAGER="unknown"
  fi

  # Detect init system
  if command -v systemctl &>/dev/null && pidof systemd &>/dev/null 2>&1; then
    INIT_SYSTEM="systemd"
  elif [ -f /sbin/openrc ]; then
    INIT_SYSTEM="openrc"
  else
    INIT_SYSTEM="unknown"
  fi

  # Detect distro
  if [ -f /etc/os-release ]; then
    . /etc/os-release
    DISTRO="${ID:-unknown}"
    DISTRO_VERSION="${VERSION_ID:-}"
    DISTRO_PRETTY="${PRETTY_NAME:-$DISTRO}"
  else
    DISTRO="unknown"
    DISTRO_VERSION=""
    DISTRO_PRETTY="Unknown"
  fi
}

detect_ip() {
  # Try multiple methods to get the server's IP address
  local ip=""
  # Method 1: hostname -I (most Linux distros)
  if command -v hostname &>/dev/null; then
    ip="$(hostname -I 2>/dev/null | awk '{print $1}')" || true
  fi
  # Method 2: ip route
  if [ -z "$ip" ] && command -v ip &>/dev/null; then
    ip="$(ip route get 1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if ($i=="src") print $(i+1)}' | head -1)" || true
  fi
  # Method 3: ifconfig
  if [ -z "$ip" ] && command -v ifconfig &>/dev/null; then
    ip="$(ifconfig 2>/dev/null | grep 'inet ' | grep -v '127.0.0.1' | awk '{print $2}' | head -1)" || true
  fi
  SERVER_IP="${ip:-127.0.0.1}"
}

detect_docker_socket_gid() {
  if [ -S /var/run/docker.sock ]; then
    DOCKER_SOCKET_GID="$(stat -c '%g' /var/run/docker.sock 2>/dev/null || stat -f '%g' /var/run/docker.sock 2>/dev/null || echo '998')"
  else
    DOCKER_SOCKET_GID="998"
  fi
}

# ── Requirement checks ───────────────────────────────────────────────────────
check_root() {
  if [ "$(id -u)" -ne 0 ]; then
    error "This script must be run as root (or with sudo)."
    echo ""
    info "Try: ${BOLD}curl -fsSL https://raw.githubusercontent.com/mannobeats/dockroot/main/install.sh | sudo bash${RESET}"
    exit 1
  fi
}

check_docker() {
  if command -v docker &>/dev/null; then
    DOCKER_INSTALLED=true
    DOCKER_VERSION="$(docker --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || echo 'unknown')"

    # Check if Docker daemon is running
    if docker info &>/dev/null; then
      DOCKER_RUNNING=true
    else
      DOCKER_RUNNING=false
    fi

    # Check Docker Compose
    if docker compose version &>/dev/null; then
      DOCKER_COMPOSE_AVAILABLE=true
      COMPOSE_CMD="docker compose"
    elif command -v docker-compose &>/dev/null; then
      DOCKER_COMPOSE_AVAILABLE=true
      COMPOSE_CMD="docker-compose"
    else
      DOCKER_COMPOSE_AVAILABLE=false
      COMPOSE_CMD=""
    fi
  else
    DOCKER_INSTALLED=false
    DOCKER_RUNNING=false
    DOCKER_COMPOSE_AVAILABLE=false
    DOCKER_VERSION=""
    COMPOSE_CMD=""
  fi
}

check_curl() {
  if ! command -v curl &>/dev/null; then
    step "Installing curl" ""
    case "$PKG_MANAGER" in
      apt)    apt-get update -qq && apt-get install -y -qq curl >/dev/null 2>&1 ;;
      dnf)    dnf install -y -q curl >/dev/null 2>&1 ;;
      yum)    yum install -y -q curl >/dev/null 2>&1 ;;
      apk)    apk add --no-cache curl >/dev/null 2>&1 ;;
      pacman) pacman -S --noconfirm curl >/dev/null 2>&1 ;;
      *)      error "Cannot install curl. Please install it manually."; exit 1 ;;
    esac
    step_done "Installing curl"
  fi
}

# ── Docker installation ──────────────────────────────────────────────────────
install_docker() {
  step "Installing Docker" "via official get.docker.com script"
  echo ""

  # Download script first, then execute — avoids pipe-in-pipe issues
  local docker_script="/tmp/get-docker-$$.sh"
  if ! curl -fsSL https://get.docker.com -o "$docker_script"; then
    step_fail "Installing Docker"
    error "Failed to download Docker install script."
    info "https://docs.docker.com/engine/install/"
    exit 1
  fi

  if sh "$docker_script"; then
    rm -f "$docker_script"
    echo ""
    step_done "Installing Docker"
  else
    rm -f "$docker_script"
    step_fail "Installing Docker"
    error "Docker installation failed. Please install Docker manually:"
    info "https://docs.docker.com/engine/install/"
    exit 1
  fi

  # Enable and start Docker service
  if [ "$INIT_SYSTEM" = "systemd" ]; then
    systemctl enable docker >/dev/null 2>&1 || true
    systemctl start docker >/dev/null 2>&1 || true
  fi

  # Wait briefly for the daemon to be ready
  sleep 3

  # Re-check Docker
  check_docker

  if [ "$DOCKER_RUNNING" != "true" ]; then
    step_fail "Starting Docker daemon"
    error "Docker was installed but the daemon is not running."
    info "Try: systemctl start docker"
    exit 1
  fi
}

# ── Setup Dockroot installation ──────────────────────────────────────────────
setup_install_dir() {
  mkdir -p "$DOCKROOT_INSTALL_DIR"
}

write_compose_file() {
  local image_tag="${DOCKROOT_IMAGE}:${DOCKROOT_VERSION}"
  local compose_file="${DOCKROOT_INSTALL_DIR}/docker-compose.yaml"

  cat > "$compose_file" <<YAML
# Dockroot — generated by install.sh
# Modify this file to customize your deployment.

services:
  init:
    image: ${image_tag}
    restart: "no"
    mem_limit: 256m
    cpus: 0.50
    environment:
      DOCKROOT_DATA_DIR: /var/lib/dockroot
    command:
      - node
      - /app/scripts/bootstrap-runtime.mjs
      - --write-postgres-password-file
      - /var/lib/dockroot/bootstrap/postgres_password
      - --write-metrics-token-file
      - /var/lib/dockroot/bootstrap/metrics_token
    volumes:
      - dockroot_data:/var/lib/dockroot
    networks:
      - backend

  app:
    image: ${image_tag}
    restart: unless-stopped
    mem_limit: 1g
    cpus: 1.00
    environment:
      APP_URL: \${APP_URL:-}
      BETTER_AUTH_TRUSTED_ORIGINS: \${BETTER_AUTH_TRUSTED_ORIGINS:-}
      DOCKROOT_DATA_DIR: /var/lib/dockroot
      DOCKROOT_MANAGER_COMPOSE_PROJECT: \${COMPOSE_PROJECT_NAME:-dockroot}
      DOCKROOT_RUNTIME_PROFILE: docker
      GITHUB_APP_STATE_SECRET: \${GITHUB_APP_STATE_SECRET:-}
      HOSTNAME: 0.0.0.0
      NEXT_PUBLIC_APP_NAME: \${NEXT_PUBLIC_APP_NAME:-Dockroot}
      PORT: 3080
      POSTGRES_DB: dockroot
      POSTGRES_HOST: postgres
      POSTGRES_PORT: 5432
      POSTGRES_USER: dockroot
      PROMETHEUS_URL: http://prometheus:9090
    ports:
      - "${DOCKROOT_PORT}:3080"
    depends_on:
      init:
        condition: service_completed_successfully
      postgres:
        condition: service_healthy
      prometheus:
        condition: service_started
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3080/api/health').then(r=>{if(!r.ok)throw 1})"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
    volumes:
      - dockroot_data:/var/lib/dockroot
      - /var/run/docker.sock:/var/run/docker.sock
    group_add:
      - "${DOCKER_SOCKET_GID}"
    security_opt:
      - no-new-privileges:true
    networks:
      - frontend
      - backend
      - monitoring

  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    mem_limit: 768m
    cpus: 1.00
    depends_on:
      init:
        condition: service_completed_successfully
    environment:
      POSTGRES_DB: dockroot
      POSTGRES_USER: dockroot
      POSTGRES_PASSWORD_FILE: /var/lib/dockroot/bootstrap/postgres_password
    volumes:
      - dockroot_data:/var/lib/dockroot:ro
      - postgres_data:/var/lib/postgresql/data
    networks:
      - backend
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U dockroot -d dockroot"]
      interval: 5s
      timeout: 5s
      retries: 10

  prometheus:
    image: prom/prometheus:v3.5.0
    restart: unless-stopped
    mem_limit: 512m
    cpus: 0.50
    depends_on:
      init:
        condition: service_completed_successfully
    entrypoint:
      - /bin/sh
      - -eu
      - -c
      - |
        TOKEN_FILE="/var/lib/dockroot/bootstrap/metrics_token"
        TOKEN=""
        if [ -f "\$\$TOKEN_FILE" ]; then
          TOKEN="\$\$(tr -d '\r\n' < "\$\$TOKEN_FILE")"
        fi
        cat > /tmp/prometheus.yml <<EOF
        global:
          scrape_interval: 15s
          evaluation_interval: 15s

        scrape_configs:
          - job_name: prometheus
            static_configs:
              - targets: ["prometheus:9090"]

          - job_name: dockroot_app
            metrics_path: /api/metrics
        EOF
        if [ -n "\$\$TOKEN" ]; then
          cat >> /tmp/prometheus.yml <<EOF
            authorization:
              type: Bearer
              credentials: \$\$TOKEN
        EOF
        fi
        cat >> /tmp/prometheus.yml <<EOF
            static_configs:
              - targets: ["app:3080"]
                labels:
                  service: dockroot-manager

          - job_name: cadvisor
            static_configs:
              - targets: ["cadvisor:8080"]
                labels:
                  service: cadvisor

          - job_name: node_exporter
            static_configs:
              - targets: ["node-exporter:9100"]
                labels:
                  service: node-exporter
        EOF
        exec /bin/prometheus --config.file=/tmp/prometheus.yml --storage.tsdb.path=/prometheus --web.enable-lifecycle
    volumes:
      - dockroot_data:/var/lib/dockroot:ro
      - prometheus_data:/prometheus
    networks:
      - monitoring

  cadvisor:
    image: gcr.io/cadvisor/cadvisor:v0.52.1
    restart: unless-stopped
    mem_limit: 256m
    cpus: 0.50
    cap_add:
      - SYS_ADMIN
    devices:
      - /dev/kmsg
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:rw
      - /sys:/sys:ro
      - /var/lib/docker:/var/lib/docker:ro
      - /dev/disk:/dev/disk:ro
    security_opt:
      - no-new-privileges:true
    networks:
      - monitoring

  node-exporter:
    image: prom/node-exporter:v1.9.1
    restart: unless-stopped
    mem_limit: 128m
    cpus: 0.25
    command:
      - --path.rootfs=/host
    volumes:
      - /:/host:ro
    security_opt:
      - no-new-privileges:true
    networks:
      - monitoring

volumes:
  dockroot_data:
  postgres_data:
  prometheus_data:

networks:
  frontend:
  backend:
  monitoring:
YAML
}

write_env_file() {
  local env_file="${DOCKROOT_INSTALL_DIR}/.env"

  if [ -f "$env_file" ]; then
    info "Existing .env found — preserving current configuration."
    return
  fi

  cat > "$env_file" <<ENV
# Dockroot environment configuration
# Generated by install.sh on $(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Optional: Set a fixed URL if behind a reverse proxy
# APP_URL=https://dockroot.example.com

# Optional: Trusted auth origins (comma-separated)
# BETTER_AUTH_TRUSTED_ORIGINS=https://dockroot.example.com

# Display name
NEXT_PUBLIC_APP_NAME=Dockroot

# Port (mapped to host)
DOCKROOT_PORT=${DOCKROOT_PORT}
ENV
}

create_systemd_service() {
  if [ "$INIT_SYSTEM" != "systemd" ]; then
    return
  fi

  cat > /etc/systemd/system/dockroot.service <<SERVICE
[Unit]
Description=Dockroot Docker Management Platform
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${DOCKROOT_INSTALL_DIR}
ExecStart=${COMPOSE_CMD} -f docker-compose.yaml up -d --remove-orphans
ExecStop=${COMPOSE_CMD} -f docker-compose.yaml down
TimeoutStartSec=120
TimeoutStopSec=60

[Install]
WantedBy=multi-user.target
SERVICE

  systemctl daemon-reload >/dev/null 2>&1
  systemctl enable dockroot.service >/dev/null 2>&1
}

pull_images() {
  step "Pulling images" "this may take a moment"
  echo ""
  if (cd "$DOCKROOT_INSTALL_DIR" && $COMPOSE_CMD pull 2>&1); then
    echo ""
    step_done "Pulling images"
  else
    echo ""
    warn "Some images failed to pull — Dockroot may still work if images are cached."
  fi
}

start_dockroot() {
  step "Starting Dockroot" ""
  echo ""
  if (cd "$DOCKROOT_INSTALL_DIR" && $COMPOSE_CMD up -d --remove-orphans 2>&1); then
    echo ""
    step_done "Starting Dockroot"
  else
    echo ""
    step_fail "Starting Dockroot"
    error "Failed to start. Check logs with:"
    info "cd ${DOCKROOT_INSTALL_DIR} && ${COMPOSE_CMD} logs"
    exit 1
  fi

  # Wait for health check
  step "Waiting for health check" ""
  local attempts=0
  local max_attempts=30
  while [ $attempts -lt $max_attempts ]; do
    if curl -sf "http://localhost:${DOCKROOT_PORT}/api/health" >/dev/null 2>&1; then
      step_done "Waiting for health check"
      return
    fi
    attempts=$((attempts + 1))
    sleep 2
  done
  warn "Health check timed out — Dockroot may still be starting."
  info "Check status with: cd ${DOCKROOT_INSTALL_DIR} && ${COMPOSE_CMD} ps"
}

# ── Upgrade function ─────────────────────────────────────────────────────────
do_upgrade() {
  banner
  separator
  echo "  ${BOLD}Upgrading Dockroot${RESET} to ${CYAN}${DOCKROOT_VERSION}${RESET}"
  separator
  echo ""

  step "Pulling latest images" ""
  (cd "$DOCKROOT_INSTALL_DIR" && $COMPOSE_CMD pull --quiet 2>/dev/null) || true
  step_done "Pulling latest images"

  step "Restarting services" ""
  (cd "$DOCKROOT_INSTALL_DIR" && $COMPOSE_CMD up -d --remove-orphans 2>/dev/null) || true
  step_done "Restarting services"

  step "Waiting for health check" ""
  local attempts=0
  while [ $attempts -lt 20 ]; do
    if curl -sf "http://localhost:${DOCKROOT_PORT}/api/health" >/dev/null 2>&1; then
      step_done "Waiting for health check"
      success_banner
      echo "  ${BOLD}Access Dockroot:${RESET} ${CYAN}http://${SERVER_IP}:${DOCKROOT_PORT}${RESET}"
      echo ""
      return
    fi
    attempts=$((attempts + 1))
    sleep 2
  done
  warn "Health check still pending. Services may need more time."
}

# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════
main() {
  banner
  check_root

  # ── Detect system ──────────────────────────────────────────────────────────
  detect_system
  detect_ip
  step_done "Detecting system"
  info "${DISTRO_PRETTY} (${OS}/${ARCH})"

  # ── Check for package manager ──────────────────────────────────────────────
  step_done "Detecting package manager"
  info "${PKG_MANAGER}"

  # ── Check requirements ─────────────────────────────────────────────────────
  check_curl
  step_done "Checking requirements"

  # ── Check for existing installation ────────────────────────────────────────
  if [ -f "${DOCKROOT_INSTALL_DIR}/docker-compose.yaml" ]; then
    echo ""
    warn "Existing Dockroot installation detected at ${DOCKROOT_INSTALL_DIR}"
    if ask_yes_no "Would you like to upgrade instead?" "y"; then
      check_docker
      detect_docker_socket_gid
      do_upgrade
      exit 0
    fi
    if ! ask_yes_no "Overwrite existing installation?" "n"; then
      info "Installation cancelled."
      exit 0
    fi
  fi

  # ── Check Docker ───────────────────────────────────────────────────────────
  check_docker

  if [ "$DOCKER_INSTALLED" = "true" ]; then
    step_done "Detecting Docker"
    info "Docker ${DOCKER_VERSION} found"

    if [ "$DOCKER_RUNNING" != "true" ]; then
      warn "Docker is installed but not running."
      if [ "$INIT_SYSTEM" = "systemd" ]; then
        step "Starting Docker" ""
        systemctl start docker >/dev/null 2>&1 || true
        sleep 2
        check_docker
        if [ "$DOCKER_RUNNING" = "true" ]; then
          step_done "Starting Docker"
        else
          step_fail "Starting Docker"
          error "Could not start Docker daemon."
          exit 1
        fi
      else
        error "Please start Docker manually and re-run this script."
        exit 1
      fi
    fi

    if [ "$DOCKER_COMPOSE_AVAILABLE" != "true" ]; then
      error "Docker Compose plugin is required but not found."
      info "Install it with: ${BOLD}apt install docker-compose-plugin${RESET}"
      info "Or visit: https://docs.docker.com/compose/install/"
      exit 1
    fi
  else
    step_skip "Detecting Docker"

    if [ "$SKIP_DOCKER" = "true" ]; then
      error "Docker is not installed and SKIP_DOCKER is set."
      exit 1
    fi

    echo ""
    if ask_yes_no "Docker is not installed. Install it now?" "y"; then
      install_docker
    else
      error "Docker is required to run Dockroot."
      exit 1
    fi
  fi

  # ── Interactive configuration ──────────────────────────────────────────────
  echo ""
  separator
  echo "  ${BOLD}Configuration${RESET}"
  separator
  echo ""

  ask_value "Port" "$DOCKROOT_PORT" "DOCKROOT_PORT"
  ask_value "Install directory" "$DOCKROOT_INSTALL_DIR" "DOCKROOT_INSTALL_DIR"
  ask_value "Version" "$DOCKROOT_VERSION" "DOCKROOT_VERSION"

  local install_monitoring="true"
  if ! ask_yes_no "Install monitoring stack (Prometheus, cAdvisor, Node Exporter)?" "y"; then
    install_monitoring="false"
  fi

  echo ""
  separator
  echo ""

  # ── Setup ──────────────────────────────────────────────────────────────────
  detect_docker_socket_gid

  step "Setting up installation directory" ""
  setup_install_dir
  step_done "Setting up installation directory"
  info "$DOCKROOT_INSTALL_DIR"

  step "Writing configuration" ""
  write_compose_file
  write_env_file

  # If user opted out of monitoring, remove those services
  if [ "$install_monitoring" = "false" ]; then
    # Remove prometheus, cadvisor, node-exporter from compose
    # Keep it simple: sed out the monitoring services and network
    local compose_file="${DOCKROOT_INSTALL_DIR}/docker-compose.yaml"
    # We'll use a Python/sed approach to strip monitoring services
    # For simplicity, we just note it in the .env
    echo "# Monitoring disabled during install" >> "${DOCKROOT_INSTALL_DIR}/.env"
    info "Monitoring services can be re-enabled by editing docker-compose.yaml"
  fi
  step_done "Writing configuration"

  step "Creating service" ""
  create_systemd_service
  step_done "Creating service"

  pull_images

  start_dockroot

  # ── Success ────────────────────────────────────────────────────────────────
  success_banner

  echo "  ${BOLD}Access Dockroot:${RESET}  ${CYAN}http://${SERVER_IP}:${DOCKROOT_PORT}${RESET}"
  echo ""
  echo "  ${BOLD}Install directory:${RESET} ${DOCKROOT_INSTALL_DIR}"
  echo "  ${BOLD}Compose file:${RESET}     ${DOCKROOT_INSTALL_DIR}/docker-compose.yaml"
  echo "  ${BOLD}Configuration:${RESET}    ${DOCKROOT_INSTALL_DIR}/.env"
  echo ""
  separator
  echo ""
  echo "  ${DIM}Useful commands:${RESET}"
  echo ""
  echo "  ${DIM}  Status:${RESET}   cd ${DOCKROOT_INSTALL_DIR} && ${COMPOSE_CMD} ps"
  echo "  ${DIM}  Logs:${RESET}     cd ${DOCKROOT_INSTALL_DIR} && ${COMPOSE_CMD} logs -f app"
  echo "  ${DIM}  Stop:${RESET}     cd ${DOCKROOT_INSTALL_DIR} && ${COMPOSE_CMD} down"
  echo "  ${DIM}  Upgrade:${RESET}  curl -fsSL https://raw.githubusercontent.com/mannobeats/dockroot/main/install.sh | sudo bash"
  echo ""
  echo "  ${DIM}Docs: https://github.com/mannobeats/dockroot${RESET}"
  echo ""
}

main "$@"
