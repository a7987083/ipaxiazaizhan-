#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; OUT="${1:-$ROOT/dist-release}"; rm -rf "$OUT"; mkdir -p "$OUT"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
rsync -a --exclude .git --exclude node_modules --exclude dist --exclude dist-release --exclude .env --exclude 'data/uploads/*' --exclude 'backups/*' "$ROOT/" "$TMP/src/"
tar -C "$TMP/src" -czf "$OUT/zonoe-ipa-download.tar.gz" .
(cd "$OUT" && sha256sum zonoe-ipa-download.tar.gz > zonoe-ipa-download.tar.gz.sha256)
echo "Release package: $OUT/zonoe-ipa-download.tar.gz"
