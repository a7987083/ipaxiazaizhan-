#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="/www/server/pgsql/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
STAMP="$(date +%Y%m%d_%H%M%S)"
DIR="$ROOT/backups/$STAMP"
mkdir -p "$DIR"
[[ -f "$ROOT/.env" ]] || { echo "缺少 $ROOT/.env" >&2; exit 1; }
set +u
set -a
source "$ROOT/.env"
set +a
set -u
command -v pg_dump >/dev/null 2>&1 || { echo "缺少 pg_dump" >&2; exit 1; }
pg_dump "$DATABASE_URL" > "$DIR/database.sql"
if [[ -d "$ROOT/data/uploads" ]]; then tar -C "$ROOT/data" -czf "$DIR/uploads.tar.gz" uploads; fi
cp "$ROOT/.env" "$DIR/.env"
[[ -f "$ROOT/VERSION" ]] && cp "$ROOT/VERSION" "$DIR/VERSION"
chmod 600 "$DIR/.env"
echo "$DIR"
