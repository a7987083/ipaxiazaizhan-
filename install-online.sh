#!/usr/bin/env bash
set -Eeuo pipefail
need(){ command -v "$1" >/dev/null 2>&1 || { echo "缺少命令: $1" >&2; exit 1; }; }
need curl; need python3; need sha256sum
REPO="${GITHUB_REPOSITORY:-a7987083/ipaxiazaizhan-}"
CHANNEL="${GITHUB_RELEASE_CHANNEL:-stable}"
INSTALL_DIR="${INSTALL_DIR:-/opt/zonoe-ipa-download}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
if [[ "$CHANNEL" == "stable" ]]; then API="https://api.github.com/repos/$REPO/releases/latest"; else API="https://api.github.com/repos/$REPO/releases/tags/$CHANNEL"; fi
curl -fsSL "$API" -o "$TMP/release.json"
python3 - "$TMP/release.json" "$TMP" <<'PY'
import json,sys
j=json.load(open(sys.argv[1])); out=sys.argv[2]
need={'zonoe-ipa-download.tar.gz':None,'zonoe-ipa-download.tar.gz.sha256':None}
for a in j.get('assets',[]):
    if a.get('name') in need: need[a['name']]=a.get('browser_download_url')
for k,v in need.items():
    if not v: raise SystemExit(f'missing release asset: {k}')
open(out+'/urls','w').write('\n'.join(need[k] for k in need))
print('release:',j.get('tag_name'),j.get('name'))
PY
mapfile -t URLS < "$TMP/urls"
curl -fL --retry 3 "${URLS[0]}" -o "$TMP/package.tar.gz"
curl -fL --retry 3 "${URLS[1]}" -o "$TMP/package.sha256"
(cd "$TMP" && sed 's#zonoe-ipa-download.tar.gz#package.tar.gz#' package.sha256 | sha256sum -c -)
# Use deploy library from package itself to avoid trusting an old local updater.
mkdir "$TMP/unpack"
python3 - "$TMP/package.tar.gz" "$TMP/unpack" <<'PY'
import os,sys,tarfile
with tarfile.open(sys.argv[1],'r:gz') as t:
 for m in t.getmembers():
  if m.name.startswith('/') or '..' in m.name.split('/') or m.issym() or m.islnk(): raise SystemExit('unsafe package')
 t.extractall(sys.argv[2])
PY
export INSTALL_DIR
source "$TMP/unpack/scripts/lib-deploy.sh"
deploy_package "$TMP/package.tar.gz"
