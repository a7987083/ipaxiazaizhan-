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

# Read-only commands never touch runtime dependencies.
for arg in "$@"; do
  if [[ "$arg" == "--check" || "$arg" == "-h" || "$arg" == "--help" ]]; then
    exec /bin/bash "$ROOT/install-online.sh" "$@"
  fi
done

DEPS_ROLLBACK=""
DEPS_PATHS=(node_modules apps/api/node_modules apps/web/node_modules)

snapshot_dependencies(){
  [[ "${DEPLOY_MODE:-}" == "native" ]] || return 0
  local found=0 rel src dst
  for rel in "${DEPS_PATHS[@]}"; do [[ -d "$ROOT/$rel" ]] && found=1; done
  [[ "$found" == 1 ]] || return 0

  mkdir -p "$BACKUP_ROOT"
  DEPS_ROLLBACK="$BACKUP_ROOT/.deps-rollback-$$"
  rm -rf "$DEPS_ROLLBACK"
  mkdir -p "$DEPS_ROLLBACK"
  echo "[ZONOE UPDATE] 保存当前 Node 依赖快照，防止 npm ci 失败后 API 无法回滚"

  for rel in "${DEPS_PATHS[@]}"; do
    src="$ROOT/$rel"; [[ -d "$src" ]] || continue
    dst="$DEPS_ROLLBACK/$rel"
    mkdir -p "$(dirname "$dst")"
    # Hard-link snapshot is fast and does not double disk usage. If the filesystem
    # does not support it, fall back to a normal copy.
    if ! cp -al "$src" "$dst" 2>/dev/null; then
      rm -rf "$dst"
      cp -a "$src" "$dst"
    fi
  done
}

restore_dependencies(){
  [[ -n "$DEPS_ROLLBACK" && -d "$DEPS_ROLLBACK" ]] || return 0
  local rel src dst
  echo "[ZONOE UPDATE] 更新失败，恢复更新前 Node 依赖"
  for rel in "${DEPS_PATHS[@]}"; do
    src="$DEPS_ROLLBACK/$rel"; [[ -d "$src" ]] || continue
    dst="$ROOT/$rel"
    rm -rf "$dst"
    mkdir -p "$(dirname "$dst")"
    mv "$src" "$dst"
  done
  rm -rf "$DEPS_ROLLBACK"
  if command -v systemctl >/dev/null 2>&1; then
    systemctl restart zonoe-api >/dev/null 2>&1 || true
    for _ in $(seq 1 20); do
      curl -fsS http://127.0.0.1:3000/healthz >/dev/null 2>&1 && break
      sleep 1
    done
  fi
}

snapshot_dependencies
set +e
/bin/bash "$ROOT/install-online.sh" "$@"
RC=$?
set -e

if [[ "$RC" -eq 0 ]]; then
  [[ -n "$DEPS_ROLLBACK" ]] && rm -rf "$DEPS_ROLLBACK"
  exit 0
fi

restore_dependencies
exit "$RC"
