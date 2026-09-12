#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
export INSTALL_DIR="$ROOT"
export BACKUP_ROOT="$ROOT/backups"
exec /bin/bash "$ROOT/install-online.sh"
