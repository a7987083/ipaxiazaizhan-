#!/usr/bin/env bash
set -Eeuo pipefail

usage(){
  cat <<'EOF'
ZONOE GitHub 在线更新

用法：
  bash update.sh                         更新到 GitHub Latest Stable Release
  bash update.sh --check                 只检查，不安装
  bash update.sh --force                 即使版本相同也重新安装
  bash update.sh --tag download-v...     更新到指定 Release Tag
  bash update.sh --branch <branch>       从指定 GitHub 分支/提交更新（预览/开发用）

环境变量：
  GITHUB_REPOSITORY       默认 a7987083/ipaxiazaizhan-
  GITHUB_RELEASE_CHANNEL  默认 stable；也可设为具体 Release Tag
  GITHUB_TOKEN / GH_TOKEN 私有仓库或更高 GitHub API 限额时可选
EOF
}

log(){ printf '\033[1;34m[ZONOE UPDATE]\033[0m %s\n' "$*"; }
warn(){ printf '\033[1;33m[WARN]\033[0m %s\n' "$*" >&2; }
die(){ printf '\033[1;31m[ERROR]\033[0m %s\n' "$*" >&2; exit 1; }
need(){ command -v "$1" >/dev/null 2>&1 || die "缺少命令: $1"; }

for c in curl python3 sha256sum tar; do need "$c"; done

REPO="${GITHUB_REPOSITORY:-a7987083/ipaxiazaizhan-}"
CHANNEL="${GITHUB_RELEASE_CHANNEL:-stable}"
INSTALL_DIR="${INSTALL_DIR:-/opt/zonoe-ipa-download}"
BACKUP_ROOT="${BACKUP_ROOT:-$INSTALL_DIR/backups}"
MODE="release"
REF=""
CHECK_ONLY=0
FORCE_UPDATE="${FORCE_UPDATE:-0}"

while (($#)); do
  case "$1" in
    --check) CHECK_ONLY=1; shift ;;
    --force) FORCE_UPDATE=1; shift ;;
    --stable) MODE="release"; CHANNEL="stable"; shift ;;
    --tag)
      [[ $# -ge 2 ]] || die "--tag 需要参数"
      MODE="release"; CHANNEL="$2"; shift 2 ;;
    --branch|--ref)
      [[ $# -ge 2 ]] || die "$1 需要参数"
      MODE="branch"; REF="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) die "未知参数: $1（使用 --help 查看帮助）" ;;
  esac
done

mkdir -p "$INSTALL_DIR/data/update-runtime" "$BACKUP_ROOT"
LOG_FILE="$INSTALL_DIR/data/update.log"
touch "$LOG_FILE"
chmod 600 "$LOG_FILE" || true
exec > >(tee -a "$LOG_FILE") 2>&1

if command -v flock >/dev/null 2>&1; then
  exec 9>"$INSTALL_DIR/data/update-runtime/update.lock"
  flock -n 9 || die "已有另一个更新任务正在运行"
fi

TMP="$(mktemp -d "$INSTALL_DIR/data/update-runtime/run.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
github_curl(){
  local url="$1" out="$2"
  local args=(-fsSL --retry 3 --retry-delay 2
    -H "Accept: application/vnd.github+json"
    -H "X-GitHub-Api-Version: 2022-11-28")
  if [[ -n "$TOKEN" ]]; then args+=(-H "Authorization: Bearer $TOKEN"); fi
  curl "${args[@]}" "$url" -o "$out"
}

urlencode(){
  python3 - "$1" <<'PY'
import sys,urllib.parse
print(urllib.parse.quote(sys.argv[1],safe=''))
PY
}

LOCAL="$(tr -d '\r\n ' < "$INSTALL_DIR/VERSION" 2>/dev/null || true)"
LATEST=""
SOURCE_DESC=""
PACKAGE=""

if [[ "$MODE" == "release" ]]; then
  if [[ "$CHANNEL" == "stable" ]]; then
    API="https://api.github.com/repos/$REPO/releases/latest"
  else
    API="https://api.github.com/repos/$REPO/releases/tags/$(urlencode "$CHANNEL")"
  fi
  log "查询 GitHub Release: $REPO / $CHANNEL"
  github_curl "$API" "$TMP/release.json"

  python3 - "$TMP/release.json" "$TMP/release-meta" <<'PY'
import json,re,sys
j=json.load(open(sys.argv[1],encoding='utf-8'))
assets={a.get('name',''):a for a in j.get('assets',[])}
candidates=[]
for name,a in assets.items():
    m=re.fullmatch(r'zonoe-ipa-download-(20\d{8,12})-baota-native\.zip',name)
    if m and name+'.sha256' in assets:
        candidates.append((int(m.group(1)),name,a,assets[name+'.sha256']))
if candidates:
    version,name,pkg,sha=max(candidates,key=lambda x:x[0])
elif 'zonoe-ipa-download.tar.gz' in assets and 'zonoe-ipa-download.tar.gz.sha256' in assets:
    tag=str(j.get('tag_name') or '')
    m=re.search(r'(20\d{8,12})',tag)
    version=int(m.group(1)) if m else 0
    name='zonoe-ipa-download.tar.gz'
    pkg=assets[name]
    sha=assets[name+'.sha256']
else:
    raise SystemExit('Release 缺少可用部署包或 SHA256 文件')
def pick(a):
    return a.get('browser_download_url') or a.get('url') or ''
with open(sys.argv[2],'w',encoding='utf-8') as f:
    f.write(f"{version}\n{name}\n{pick(pkg)}\n{pick(sha)}\n{j.get('tag_name','')}\n")
PY

  mapfile -t META < "$TMP/release-meta"
  LATEST="${META[0]}"
  PKG_NAME="${META[1]}"
  PKG_URL="${META[2]}"
  SHA_URL="${META[3]}"
  RELEASE_TAG="${META[4]}"
  SOURCE_DESC="release:${RELEASE_TAG}"

  [[ -n "$LATEST" && "$LATEST" != "0" ]] || die "无法识别 Release 版本号"
  log "本地版本: ${LOCAL:-unknown}；GitHub 版本: $LATEST"

  if [[ "$CHECK_ONLY" == "1" ]]; then
    if [[ -n "$LOCAL" && "$LOCAL" =~ ^[0-9]+$ && "$LATEST" =~ ^[0-9]+$ && "$LATEST" -le "$LOCAL" ]]; then
      log "当前已是最新版本（或本地版本更高）"
    else
      log "发现可更新版本: $LATEST"
    fi
    exit 0
  fi

  if [[ "$FORCE_UPDATE" != "1" && -n "$LOCAL" && "$LOCAL" =~ ^[0-9]+$ && "$LATEST" =~ ^[0-9]+$ && "$LATEST" -le "$LOCAL" ]]; then
    log "已经是最新版本: $LOCAL"
    exit 0
  fi

  PACKAGE="$TMP/$PKG_NAME"
  CHECKSUM="$TMP/$PKG_NAME.sha256"
  log "下载部署包: $PKG_NAME"
  github_curl "$PKG_URL" "$PACKAGE"
  github_curl "$SHA_URL" "$CHECKSUM"

  (
    cd "$TMP"
    sha256sum -c "$(basename "$CHECKSUM")"
  ) || die "SHA256 校验失败，已中止更新"

else
  [[ -n "$REF" ]] || die "branch/ref 不能为空"
  ENCODED_REF="$(urlencode "$REF")"
  log "查询 GitHub 分支/提交: $REPO / $REF"
  github_curl "https://api.github.com/repos/$REPO/commits/$ENCODED_REF" "$TMP/commit.json"
  COMMIT_SHA="$(python3 - "$TMP/commit.json" <<'PY'
import json,sys
j=json.load(open(sys.argv[1],encoding='utf-8'))
print(j.get('sha',''))
PY
)"
  [[ "$COMMIT_SHA" =~ ^[0-9a-f]{40}$ ]] || die "无法解析 GitHub commit SHA"
  PACKAGE="$TMP/github-$COMMIT_SHA.tar.gz"
  github_curl "https://api.github.com/repos/$REPO/tarball/$COMMIT_SHA" "$PACKAGE"

  LATEST="$(python3 - "$PACKAGE" <<'PY'
import re,sys,tarfile
with tarfile.open(sys.argv[1],'r:*') as t:
    matches=[m for m in t.getmembers() if m.isfile() and (m.name=='VERSION' or m.name.endswith('/VERSION'))]
    if not matches: raise SystemExit('GitHub archive 缺少 VERSION')
    data=t.extractfile(matches[0]).read().decode().strip()
    if not re.fullmatch(r'20\d{8,12}',data): raise SystemExit('VERSION 格式无效')
    print(data)
PY
)"
  SOURCE_DESC="branch:${REF}@${COMMIT_SHA}"
  log "本地版本: ${LOCAL:-unknown}；分支版本: $LATEST；commit: $COMMIT_SHA"

  if [[ "$CHECK_ONLY" == "1" ]]; then
    exit 0
  fi
  if [[ "$FORCE_UPDATE" != "1" && -n "$LOCAL" && "$LOCAL" =~ ^[0-9]+$ && "$LATEST" =~ ^[0-9]+$ && "$LATEST" -le "$LOCAL" ]]; then
    log "分支版本没有高于本地版本；如需重装请加 --force"
    exit 0
  fi
fi

export INSTALL_DIR BACKUP_ROOT
# Always use the currently installed deployment engine to stage/backup/rollback.
# The new package's install.sh takes over only after the source tree is safely staged.
source "$INSTALL_DIR/scripts/lib-deploy.sh"
deploy_package "$PACKAGE"

NEW_VERSION="$(tr -d '\r\n ' < "$INSTALL_DIR/VERSION" 2>/dev/null || echo unknown)"
printf '%s from=%s to=%s source=%s\n' \
  "$(date -Iseconds)" "${LOCAL:-unknown}" "$NEW_VERSION" "$SOURCE_DESC" \
  >> "$INSTALL_DIR/data/update-history.log"
chmod 600 "$INSTALL_DIR/data/update-history.log" || true

log "在线更新完成: ${LOCAL:-unknown} -> $NEW_VERSION"
log "来源: $SOURCE_DESC"
log "更新日志: $LOG_FILE"
