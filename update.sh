#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/.env" ]]; then
  set +u
  set -a
  source "$ROOT/.env"
  set +a
  set -u
fi

export INSTALL_DIR="$ROOT"
export BACKUP_ROOT="${BACKUP_ROOT:-$ROOT/backups}"
exec /bin/bash "$ROOT/install-online.sh" "$@"
