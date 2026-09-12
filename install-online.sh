#!/usr/bin/env bash
set -Eeuo pipefail
need(){ command -v "$1" >/dev/null 2>&1 || { echo "缺少命令: $1" >&2; exit 1; }; }
need curl; need python3; need sha256sum
REPO="${GITHUB_REPOSITORY:-a7987083/ipaxiazaizhan-}"
CHANNEL="${GITHUB_RELEASE_CHANNEL:-stable}"
INSTALL_DIR="${INSTALL_DIR:-/opt/zonoe-ipa-download}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
if [[ "$CHANNEL" == "stable" ]]; then API="https://api.github.com/repos/$REPO/releases/latest"; else API="https://api.github.com/repos/$REPO/releases/tags/$CHANNEL"; fi
curl -fsSL --retry 3 "$API" -o "$TMP/release.json"
python3 - "$TMP/release.json" "$TMP" <<'PY'
import json,re,sys
j=json.load(open(sys.argv[1],encoding='utf-8')); out=sys.argv[2]
need={'zonoe-ipa-download.tar.gz':None,'zonoe-ipa-download.tar.gz.sha256':None}
for a in j.get('assets',[]):
    if a.get('name') in need: need[a['name']]=a.get('browser_download_url')
for k,v in need.items():
    if not v: raise SystemExit(f'missing release asset: {k}')
tag=str(j.get('tag_name') or '')
m=re.search(r'(20\d{8,12})',tag)
version=m.group(1) if m else ''
open(out+'/urls','w').write('\n'.join(need[k] for k in need))
open(out+'/version','w').write(version)
print('release:',tag,j.get('name'))
PY
LATEST="$(cat "$TMP/version")"
LOCAL="$(tr -d '\r\n ' < "$INSTALL_DIR/VERSION" 2>/dev/null || true)"
if [[ "${FORCE_UPDATE:-0}" != "1" && -n "$LATEST" && -n "$LOCAL" && "$LATEST" =~ ^[0-9]+$ && "$LOCAL" =~ ^[0-9]+$ && "$LATEST" -le "$LOCAL" ]]; then
  echo "已经是最新版本: $LOCAL"
  exit 0
fi
mapfile -t URLS < "$TMP/urls"
curl -fL --retry 3 "${URLS[0]}" -o "$TMP/package.tar.gz"
curl -fL --retry 3 "${URLS[1]}" -o "$TMP/package.sha256"
(cd "$TMP" && sed 's#zonoe-ipa-download.tar.gz#package.tar.gz#' package.sha256 | sha256sum -c -)
mkdir "$TMP/unpack"
python3 - "$TMP/package.tar.gz" "$TMP/unpack" <<'PY'
import sys,tarfile
with tarfile.open(sys.argv[1],'r:gz') as t:
 for m in t.getmembers():
  if m.name.startswith('/') or '..' in m.name.split('/') or m.issym() or m.islnk(): raise SystemExit('unsafe package')
 t.extractall(sys.argv[2])
PY
export INSTALL_DIR
source "$TMP/unpack/scripts/lib-deploy.sh"
deploy_package "$TMP/package.tar.gz"
