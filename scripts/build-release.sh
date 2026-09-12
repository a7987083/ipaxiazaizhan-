#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/dist-release}"
rm -rf "$OUT"
mkdir -p "$OUT"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

rsync -a --exclude .git --exclude node_modules --exclude dist --exclude dist-release --exclude .env --exclude '.zonoe-baota-installed' --exclude '.zonoe-native-installed' --exclude 'data/uploads/*' --exclude 'data/update-runtime/*' --exclude 'backups/*' "$ROOT/" "$TMP/src/"

# BaoTa may remove the top-level install hook after invoking it. Keep a byte-for-byte
# recovery copy inside scripts/ so a failed install can be resumed without re-uploading.
cp "$TMP/src/install.sh" "$TMP/src/scripts/native-install.sh"
chmod +x "$TMP/src/scripts/native-install.sh"

tar -C "$TMP/src" -czf "$OUT/zonoe-ipa-download.tar.gz" .
(cd "$OUT" && sha256sum zonoe-ipa-download.tar.gz > zonoe-ipa-download.tar.gz.sha256)

VERSION="$(tr -d '\r\n ' < "$ROOT/VERSION")"
NATIVE_ZIP="zonoe-ipa-download-${VERSION}-baota-native.zip"

(cd "$TMP/src" && zip -qr "$OUT/$NATIVE_ZIP" . -x '.github/*' 'dist-release/*' 'data/uploads/*' 'data/update-runtime/*' 'backups/*' '.env' '.zonoe-baota-installed' '.zonoe-native-installed' 'docker-compose.yml' 'docker-compose.dev.yml' 'apps/api/Dockerfile' 'apps/web/Dockerfile' 'apps/web/nginx.conf' 'deploy/*')
(cd "$OUT" && sha256sum "$NATIVE_ZIP" > "$NATIVE_ZIP.sha256")

echo "Release package: $OUT/zonoe-ipa-download.tar.gz"
echo "BaoTa native package: $OUT/$NATIVE_ZIP"
