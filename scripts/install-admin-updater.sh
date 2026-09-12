#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# This hook is invoked by npm postinstall. CI/developer installs must remain inert.
[[ "$(id -u)" -eq 0 ]] || exit 0
command -v systemctl >/dev/null 2>&1 || exit 0
[[ -d /run/systemd/system ]] || exit 0
[[ -f "$ROOT/.env" ]] || exit 0
grep -Eq '^DEPLOY_MODE=native$' "$ROOT/.env" || exit 0

RUNTIME="$ROOT/data/update-runtime"
mkdir -p "$RUNTIME"

cat > /etc/systemd/system/zonoe-updater.service <<UNIT
[Unit]
Description=ZONOE GitHub Online Updater
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=root
WorkingDirectory=$ROOT
EnvironmentFile=$ROOT/.env
ExecStart=/bin/bash $ROOT/scripts/admin-update-worker.sh
UMask=0027
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT

cat > /etc/systemd/system/zonoe-updater.path <<UNIT
[Unit]
Description=Watch ZONOE admin online update requests

[Path]
PathExists=$RUNTIME/admin-update-request.json
Unit=zonoe-updater.service

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now zonoe-updater.path >/dev/null
