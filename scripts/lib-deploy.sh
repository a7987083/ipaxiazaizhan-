#!/usr/bin/env bash
set -Eeuo pipefail

log(){ printf '\033[1;34m[ZONOE]\033[0m %s\n' "$*"; }
warn(){ printf '\033[1;33m[WARN]\033[0m %s\n' "$*" >&2; }
die(){ printf '\033[1;31m[ERROR]\033[0m %s\n' "$*" >&2; exit 1; }
need(){ command -v "$1" >/dev/null 2>&1 || die "缺少命令: $1"; }

INSTALL_DIR="${INSTALL_DIR:-/opt/zonoe-ipa-download}"
BACKUP_ROOT="${BACKUP_ROOT:-$INSTALL_DIR/backups}"
export PATH="/www/server/mysql/bin:/usr/local/mysql/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"

safe_extract(){
  local pkg="$1" dst="$2"
  python3 - "$pkg" "$dst" <<'PY'
import os,stat,sys,tarfile,zipfile
pkg,dst=sys.argv[1:]
os.makedirs(dst,exist_ok=True)
def unsafe(n):
    n=n.replace('\\','/')
    return n.startswith('/') or '..' in n.split('/')
if zipfile.is_zipfile(pkg):
    with zipfile.ZipFile(pkg) as z:
        for i in z.infolist():
            if unsafe(i.filename):
                raise SystemExit(f'unsafe zip entry: {i.filename}')
            mode=(i.external_attr >> 16) & 0o170000
            if stat.S_ISLNK(mode):
                raise SystemExit(f'zip symlink not allowed: {i.filename}')
        z.extractall(dst)
else:
    with tarfile.open(pkg,'r:*') as t:
        for m in t.getmembers():
            if unsafe(m.name) or m.issym() or m.islnk():
                raise SystemExit(f'unsafe tar entry: {m.name}')
        t.extractall(dst)
PY
}

resolve_source_root(){
  local dst="$1"
  if [[ -f "$dst/install.sh" && -f "$dst/package-lock.json" ]]; then
    printf '%s\n' "$dst"
    return 0
  fi
  local candidates=()
  while IFS= read -r -d '' f; do
    local d; d="$(dirname "$f")"
    [[ -f "$d/package-lock.json" ]] && candidates+=("$d")
  done < <(find "$dst" -mindepth 2 -maxdepth 2 -type f -name install.sh -print0)
  [[ ${#candidates[@]} -eq 1 ]] || die "部署包结构无法识别（install.sh/package-lock.json）"
  printf '%s\n' "${candidates[0]}"
}

source_env(){
  if [[ -f "$INSTALL_DIR/.env" ]]; then
    set +u
    set -a
    source "$INSTALL_DIR/.env"
    set +a
    set -u
  fi
}

backup_current(){
  mkdir -p "$BACKUP_ROOT"
  local stamp; stamp="$(date +%Y%m%d_%H%M%S)"
  CURRENT_BACKUP="$BACKUP_ROOT/$stamp"
  mkdir -p "$CURRENT_BACKUP"

  [[ -d "$INSTALL_DIR" ]] || return 0
  log "备份当前程序 -> $CURRENT_BACKUP/program.tar.gz"
  tar --exclude='./backups' --exclude='./data' --exclude='./.env' --exclude='./node_modules' --exclude='./public' \
    -C "$INSTALL_DIR" -czf "$CURRENT_BACKUP/program.tar.gz" . || true
  [[ -f "$INSTALL_DIR/.env" ]] && cp "$INSTALL_DIR/.env" "$CURRENT_BACKUP/.env"
  [[ -f "$INSTALL_DIR/VERSION" ]] && cp "$INSTALL_DIR/VERSION" "$CURRENT_BACKUP/VERSION"

  if [[ -d "$INSTALL_DIR/public" ]]; then
    tar --exclude='./files' -C "$INSTALL_DIR/public" -czf "$CURRENT_BACKUP/public.tar.gz" . || true
  fi
  # 1208+ does not copy application rows or IPA files into a second database.
  # Only the small local control plane (admin hash, settings, encrypted MySQL
  # source definitions, local download audit) needs a point-in-time backup.
  if [[ -d "$INSTALL_DIR/data/control" ]]; then
    tar -C "$INSTALL_DIR/data" -czf "$CURRENT_BACKUP/control.tar.gz" control || true
  fi

  if command -v docker >/dev/null 2>&1 && [[ -f "$INSTALL_DIR/docker-compose.yml" ]] && (cd "$INSTALL_DIR" && docker compose ps --status running --services 2>/dev/null | grep -qx postgres); then
    CURRENT_MODE="docker"
  else
    CURRENT_MODE="native"
  fi
}

stop_current(){
  if [[ "${CURRENT_MODE:-}" == "docker" ]]; then
    (cd "$INSTALL_DIR" && docker compose down) || true
  else
    systemctl stop zonoe-api >/dev/null 2>&1 || true
  fi
}

restore_public(){
  local b="$1"
  [[ -f "$b/public.tar.gz" ]] || return 0
  local ptmp; ptmp="$(mktemp -d)"
  tar -xzf "$b/public.tar.gz" -C "$ptmp"
  mkdir -p "$INSTALL_DIR/public"
  rsync -a --delete \
    --exclude='.user.ini' \
    --exclude='.well-known/' \
    --exclude='files' \
    "$ptmp/" "$INSTALL_DIR/public/" || true
  rm -rf "$ptmp"
  if [[ -d "$INSTALL_DIR/data/uploads" ]]; then
    rm -rf "$INSTALL_DIR/public/files" 2>/dev/null || true
    ln -s "$INSTALL_DIR/data/uploads" "$INSTALL_DIR/public/files" 2>/dev/null || true
  fi
}

restore_backup(){
  local b="${CURRENT_BACKUP:-}"
  [[ -n "$b" && -d "$b" ]] || return 1
  warn "部署失败，开始自动回滚程序: $b"

  # Keep BaoTa's public directory in place so immutable .user.ini is never removed.
  find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 \
    ! -name data ! -name backups ! -name .env ! -name public \
    -exec rm -rf {} + || true
  [[ -f "$b/program.tar.gz" ]] && tar -xzf "$b/program.tar.gz" -C "$INSTALL_DIR"
  [[ -f "$b/.env" ]] && cp "$b/.env" "$INSTALL_DIR/.env"
  restore_public "$b"

  if [[ "${CURRENT_MODE:-}" == "docker" && -f "$INSTALL_DIR/docker-compose.yml" ]] && command -v docker >/dev/null 2>&1; then
    (cd "$INSTALL_DIR" && docker compose up -d --build) || true
    return 0
  fi

  if [[ -f "$INSTALL_DIR/package-lock.json" ]] && command -v npm >/dev/null 2>&1; then
    (cd "$INSTALL_DIR" && npm ci) >/dev/null 2>&1 || warn "回滚依赖恢复失败；程序文件已恢复"
  fi
  systemctl daemon-reload >/dev/null 2>&1 || true
  systemctl restart zonoe-api >/dev/null 2>&1 || true

  if ! curl -fsS http://127.0.0.1:3000/healthz >/dev/null 2>&1; then
    warn "程序已回滚，但 API 未恢复；控制数据备份位于 $b/control.tar.gz（如存在）"
  fi
}

deploy_package(){
  local pkg="$1"
  [[ "$(id -u)" -eq 0 ]] || die "安装/更新需要 root 权限"
  need python3; need tar; need curl; need rsync
  [[ -f "$pkg" ]] || die "部署包不存在: $pkg"

  local tmp; tmp="$(mktemp -d)"
  local old_return_trap
  old_return_trap="$(trap -p RETURN || true)"
  trap 'rm -rf "$tmp"' RETURN

  safe_extract "$pkg" "$tmp/unpack"
  local src; src="$(resolve_source_root "$tmp/unpack")"
  [[ -f "$src/install.sh" ]] || die "部署包缺少 install.sh"
  [[ -f "$src/package-lock.json" ]] || die "部署包缺少 package-lock.json"

  local new_version
  new_version="$(tr -d '\r\n ' < "$src/VERSION" 2>/dev/null || true)"
  [[ "$new_version" =~ ^20[0-9]{8,12}$ ]] || die "部署包 VERSION 无效"

  backup_current
  stop_current

  mkdir -p "$INSTALL_DIR/data/uploads" "$INSTALL_DIR/data/update-runtime" "$INSTALL_DIR/backups" "$INSTALL_DIR/public"
  local envtmp=''
  [[ -f "$INSTALL_DIR/.env" ]] && envtmp="$(mktemp)" && cp "$INSTALL_DIR/.env" "$envtmp"

  # Do not remove public/: BaoTa may set immutable on public/.user.ini.
  # Stage the new source tree while preserving runtime data and built frontend.
  rsync -a --delete \
    --exclude='.env' \
    --exclude='data/' \
    --exclude='backups/' \
    --exclude='public/' \
    --exclude='node_modules/' \
    "$src/" "$INSTALL_DIR/"

  if [[ -n "$envtmp" ]]; then cp "$envtmp" "$INSTALL_DIR/.env"; rm -f "$envtmp"; fi
  chmod +x "$INSTALL_DIR"/*.sh "$INSTALL_DIR"/scripts/*.sh 2>/dev/null || true

  source_env
  local domain="${ZONOE_DOMAIN:-}"
  if [[ -z "$domain" && -n "${FRONTEND_ORIGIN:-}" ]]; then
    domain="${FRONTEND_ORIGIN#http://}"; domain="${domain#https://}"; domain="${domain%%/*}"
  fi

  if ! (cd "$INSTALL_DIR" && bash install.sh "$domain"); then
    restore_backup
    die "部署失败，已尝试自动回滚"
  fi

  log "部署完成，版本: $(cat "$INSTALL_DIR/VERSION" 2>/dev/null || echo unknown)"
  [[ -n "$old_return_trap" ]] && eval "$old_return_trap" || trap - RETURN
  rm -rf "$tmp"
}
