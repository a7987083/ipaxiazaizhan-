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
            if unsafe(i.filename): raise SystemExit(f'unsafe zip entry: {i.filename}')
            mode=(i.external_attr >> 16) & 0o170000
            if stat.S_ISLNK(mode): raise SystemExit(f'zip symlink not allowed: {i.filename}')
        z.extractall(dst)
else:
    with tarfile.open(pkg,'r:*') as t:
        for m in t.getmembers():
            if unsafe(m.name) or m.issym() or m.islnk(): raise SystemExit(f'unsafe tar entry: {m.name}')
        t.extractall(dst)
PY
}

resolve_source_root(){
  local dst="$1"
  if [[ -f "$dst/install.sh" && -f "$dst/package-lock.json" ]]; then printf '%s\n' "$dst"; return 0; fi
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
    set +u; set -a; source "$INSTALL_DIR/.env"; set +a; set -u
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
  [[ -f "$INSTALL_DIR/.env" ]] && cp -a "$INSTALL_DIR/.env" "$CURRENT_BACKUP/.env"
  [[ -f "$INSTALL_DIR/VERSION" ]] && cp -a "$INSTALL_DIR/VERSION" "$CURRENT_BACKUP/VERSION"

  if [[ -d "$INSTALL_DIR/public" ]]; then
    tar --exclude='./files' -C "$INSTALL_DIR/public" -czf "$CURRENT_BACKUP/public.tar.gz" . || true
  fi

  # Durable control-plane state is an update invariant. Copy it separately so a
  # successful code update can never silently replace admin/settings/MySQL/OpenList
  # configuration or the accumulated IPA metadata cache. Ephemeral task/list cache
  # files are intentionally excluded because they can be regenerated after restart.
  if [[ -d "$INSTALL_DIR/data/control" ]]; then
    log "创建持久配置快照"
    mkdir -p "$CURRENT_BACKUP/control"
    rsync -a \
      --exclude='openlist-task.json' \
      --exclude='openlist-directory-cache.json' \
      "$INSTALL_DIR/data/control/" "$CURRENT_BACKUP/control/"
    tar -C "$CURRENT_BACKUP" -czf "$CURRENT_BACKUP/control.tar.gz" control || true
  fi

  if command -v docker >/dev/null 2>&1 && [[ -f "$INSTALL_DIR/docker-compose.yml" ]] && (cd "$INSTALL_DIR" && docker compose ps --status running --services 2>/dev/null | grep -qx postgres); then
    CURRENT_MODE="docker"
  else
    CURRENT_MODE="native"
  fi
}

stop_current(){
  if [[ "${CURRENT_MODE:-}" == "docker" ]]; then (cd "$INSTALL_DIR" && docker compose down) || true
  else systemctl stop zonoe-api >/dev/null 2>&1 || true
  fi
}

restore_public(){
  local b="$1"
  [[ -f "$b/public.tar.gz" ]] || return 0
  local ptmp; ptmp="$(mktemp -d)"
  tar -xzf "$b/public.tar.gz" -C "$ptmp"
  mkdir -p "$INSTALL_DIR/public"
  rsync -a --delete --exclude='.user.ini' --exclude='.well-known/' --exclude='files' "$ptmp/" "$INSTALL_DIR/public/" || true
  rm -rf "$ptmp"
  if [[ -d "$INSTALL_DIR/data/uploads" ]]; then
    rm -rf "$INSTALL_DIR/public/files" 2>/dev/null || true
    ln -s "$INSTALL_DIR/data/uploads" "$INSTALL_DIR/public/files" 2>/dev/null || true
  fi
}

merge_old_env_values(){
  local old="$1" current="$2"
  [[ -f "$old" ]] || return 0
  python3 - "$old" "$current" <<'PY'
import pathlib,sys
oldp,curp=map(pathlib.Path,sys.argv[1:])
old=oldp.read_text(encoding='utf-8').splitlines()
cur=curp.read_text(encoding='utf-8').splitlines() if curp.exists() else []
oldkv={}
for line in old:
    if line and not line.lstrip().startswith('#') and '=' in line:
        k=line.split('=',1)[0].strip()
        if k: oldkv[k]=line
out=[]; seen=set()
for line in cur:
    if line and not line.lstrip().startswith('#') and '=' in line:
        k=line.split('=',1)[0].strip()
        if k in oldkv:
            out.append(oldkv[k]); seen.add(k); continue
    out.append(line)
for k,line in oldkv.items():
    if k not in seen and not any(x.startswith(k+'=') for x in out): out.append(line)
curp.write_text('\n'.join(out).rstrip()+'\n',encoding='utf-8')
PY
}

restore_persistent_state_after_install(){
  local b="${CURRENT_BACKUP:-}"
  [[ -n "$b" && -d "$b" ]] || return 0
  log "恢复更新前持久配置"

  # Keep new files introduced by the new version, but overwrite every durable
  # pre-update control file with the exact snapshot from immediately before update.
  if [[ -d "$b/control" ]]; then
    mkdir -p "$INSTALL_DIR/data/control"
    rsync -a "$b/control/" "$INSTALL_DIR/data/control/"
  fi
  if [[ -f "$b/.env" ]]; then
    merge_old_env_values "$b/.env" "$INSTALL_DIR/.env"
  fi

  if id zonoe >/dev/null 2>&1; then chown -R zonoe:zonoe "$INSTALL_DIR/data" || true; fi
  if [[ -f "$INSTALL_DIR/.env" ]]; then chown root:zonoe "$INSTALL_DIR/.env" 2>/dev/null || true; chmod 640 "$INSTALL_DIR/.env" || true; fi

  if [[ "${CURRENT_MODE:-}" != "docker" ]] && command -v systemctl >/dev/null 2>&1; then
    log "重启 API 并校验持久配置"
    systemctl restart zonoe-api
    local ok=0
    for _ in $(seq 1 40); do
      if curl -fsS http://127.0.0.1:3000/healthz >/dev/null 2>&1; then ok=1; break; fi
      sleep 1
    done
    [[ "$ok" == 1 ]] || return 1
  fi
}

restore_backup(){
  local b="${CURRENT_BACKUP:-}"
  [[ -n "$b" && -d "$b" ]] || return 1
  warn "部署失败，开始自动回滚程序: $b"

  find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 ! -name data ! -name backups ! -name .env ! -name public -exec rm -rf {} + || true
  [[ -f "$b/program.tar.gz" ]] && tar -xzf "$b/program.tar.gz" -C "$INSTALL_DIR"
  [[ -f "$b/.env" ]] && cp -a "$b/.env" "$INSTALL_DIR/.env"
  if [[ -d "$b/control" ]]; then
    mkdir -p "$INSTALL_DIR/data/control"
    rsync -a "$b/control/" "$INSTALL_DIR/data/control/" || true
  elif [[ -f "$b/control.tar.gz" ]]; then
    tar -xzf "$b/control.tar.gz" -C "$INSTALL_DIR/data" || true
  fi
  restore_public "$b"

  if id zonoe >/dev/null 2>&1; then chown -R zonoe:zonoe "$INSTALL_DIR/data" || true; fi
  if [[ -f "$INSTALL_DIR/.env" ]]; then chown root:zonoe "$INSTALL_DIR/.env" 2>/dev/null || true; chmod 640 "$INSTALL_DIR/.env" || true; fi

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
    warn "程序已回滚，但 API 未恢复；持久配置备份位于 $b/control（如存在）"
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
  [[ -f "$INSTALL_DIR/.env" ]] && envtmp="$(mktemp)" && cp -a "$INSTALL_DIR/.env" "$envtmp"

  rsync -a --delete \
    --exclude='.env' \
    --exclude='data/' \
    --exclude='backups/' \
    --exclude='public/' \
    --exclude='node_modules/' \
    "$src/" "$INSTALL_DIR/"

  if [[ -n "$envtmp" ]]; then cp -a "$envtmp" "$INSTALL_DIR/.env"; rm -f "$envtmp"; fi
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

  if ! restore_persistent_state_after_install; then
    restore_backup
    die "新版本启动后持久配置恢复/健康检查失败，已尝试自动回滚"
  fi

  log "部署完成，版本: $(cat "$INSTALL_DIR/VERSION" 2>/dev/null || echo unknown)"
  [[ -n "$old_return_trap" ]] && eval "$old_return_trap" || trap - RETURN
  rm -rf "$tmp"
}
