#!/usr/bin/env bash
set -Eeuo pipefail
BASE="${1:-http://127.0.0.1}"
for p in /healthz /api/v1/home /api/v1/categories '/api/v1/apps?page=1&pageSize=5'; do
  echo "GET $p"; curl -fsS "$BASE$p" >/dev/null
done
HTML="$(curl -fsS "$BASE/")"
echo "$HTML" | grep -q 'ZONOE'
ASSET="$(printf '%s' "$HTML" | grep -oE '/assets/[^"[:space:]]+\.js' | head -n1 || true)"
[[ -n "$ASSET" ]] || { echo 'missing frontend JS asset in index.html' >&2; exit 1; }
echo "GET $ASSET"; curl -fsS "$BASE$ASSET" >/dev/null
echo "SMOKE PASS"
