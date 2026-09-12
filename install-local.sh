#!/usr/bin/env bash
set -Eeuo pipefail
BASE="$(cd "$(dirname "$0")" && pwd)"
source "$BASE/scripts/lib-deploy.sh"
PKG="${1:-}"
[[ -n "$PKG" ]] || { echo "用法: sudo bash install-local.sh /path/zonoe-package.{zip,tar.gz} [sha256-file]"; exit 2; }
if [[ -n "${2:-}" ]]; then
  expected="$(awk '{print $1}' "$2")"
  actual="$(sha256sum "$PKG" | awk '{print $1}')"
  [[ "$expected" == "$actual" ]] || die "SHA256 不匹配"
fi
deploy_package "$PKG"
