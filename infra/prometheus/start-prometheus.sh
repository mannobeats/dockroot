#!/bin/sh
set -eu

CONFIG_FILE=/tmp/prometheus.yml
APP_TARGET="${APP_METRICS_TARGET:-app:3080}"
HOST_TARGET="${DEV_HOST_METRICS_TARGET:-}"

cat > "$CONFIG_FILE" <<EOF
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

if [ -n "${METRICS_BEARER_TOKEN:-}" ]; then
	cat >> "$CONFIG_FILE" <<EOF
    authorization:
      type: Bearer
      credentials: ${METRICS_BEARER_TOKEN}
EOF
fi

cat >> "$CONFIG_FILE" <<EOF
    static_configs:
      - targets: ["${APP_TARGET}"]
        labels:
          service: dockroot-manager
EOF

if [ -n "$HOST_TARGET" ]; then
	cat >> "$CONFIG_FILE" <<EOF

  - job_name: dockroot_host_dev
    metrics_path: /api/metrics
EOF

	if [ -n "${METRICS_BEARER_TOKEN:-}" ]; then
		cat >> "$CONFIG_FILE" <<EOF
    authorization:
      type: Bearer
      credentials: ${METRICS_BEARER_TOKEN}
EOF
	fi

	cat >> "$CONFIG_FILE" <<EOF
    static_configs:
      - targets: ["${HOST_TARGET}"]
        labels:
          service: dockroot-host-dev
EOF
fi

cat >> "$CONFIG_FILE" <<EOF

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

exec /bin/prometheus \
	--config.file="$CONFIG_FILE" \
	--storage.tsdb.path=/prometheus \
	--web.enable-lifecycle
