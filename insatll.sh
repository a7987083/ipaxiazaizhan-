#!/usr/bin/env bash
# BaoTa's historical package document spells this hook as "insatll.sh".
# Keep this compatibility shim so old/new importers both reach the same idempotent installer.
set -Eeuo pipefail
BASE="$(cd "$(dirname "$0")" && pwd)"
cd "$BASE"
exec /bin/bash "$BASE/install.sh" "${1:-}"
