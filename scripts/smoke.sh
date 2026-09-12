#!/usr/bin/env bash
set -Eeuo pipefail
BASE="${1:-http://127.0.0.1}"
for p in /healthz /api/v1/home /api/v1/categories '/api/v1/apps?page=1&pageSize=5'; do
  echo "GET $p"; curl -fsS "$BASE$p" >/dev/null
done
echo "SMOKE PASS"
