#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; STAMP="$(date +%Y%m%d_%H%M%S)"; DIR="$ROOT/backups/$STAMP"; mkdir -p "$DIR"
(cd "$ROOT" && docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$DIR/database.sql")
tar -C "$ROOT/data" -czf "$DIR/uploads.tar.gz" uploads
cp "$ROOT/.env" "$DIR/.env"
echo "$DIR"
