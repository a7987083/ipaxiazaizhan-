#!/usr/bin/env bash
set -Eeuo pipefail

log(){ printf '\033[1;34m[ZONOE]\033[0m %s\n' "$*"; }
warn(){ printf '\033[1;33m[WARN]\033[0m %s\n' "$*" >&2; }
die(){ printf '\033[1;31m[ERROR]\033[0m %s\n' "$*" >&2; exit 1; }
need(){ command -v "$1" >/dev/null 2>&1 || die "缺少命令: $1"; }

INSTALL_DIR="${INSTALL_DIR:-/opt/zonoe-ipa-download}"
BACKUP_ROOT="${BACKUP_ROOT:-$INSTALL_DIR/backups}"
export PATH="/www/server/pgsql/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"

safe_extract(){
  local pkg="$1" dst="$2"
  python3 - "$pkg" "$dst" <<'PY'
import os,sys,tarfile
pkg,dst=sys.argv[1:]
os.makedirs(dst,exist_ok=True)
with tarfile.open(pkg,'r:gz') as t:
    for m in t.getmembers():
        n=m.name
        if n.startswith('/') or '..' in n.split('/') or m.issym() or m.islnk():
            raise SystemExit(f'unsafe archive entry: {n}')
    t.extractall(dst)
PY
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
  tar --exclude='./backups' --exclude='./data' --exclude='./.env' --exclude='./node_modules' --exclude='./public' -C "$INSTALL_DIR" -czf "$CURRENT_BACKUP/program.tar.gz" . || true
  [[ -f "$INSTALL_DIR/.env" ]] && cp "$INSTALL_DIR/.env" "$CURRENT_BACKUP/.env"
  [[ -f "$INSTALL_DIR/VERSION" ]] && cp "$INSTALL_DIR/VERSION" "$CURRENT_BACKUP/VERSION"

  if command -v docker >/dev/null 2>&1 && [[ -f "$INSTALL_DIR/docker-compose.yml" ]] && (cd "$INSTALL_DIR" && docker compose ps --status running --services 2>/dev/null | grep -qx postgres); then
    log "备份旧 Docker PostgreSQL"
    (cd "$INSTALL_DIR" && docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$CURRENT_BACKUP/database.sql") || true
    CURRENT_MODE="docker"
  else
    CURRENT_MODE="native"
    source_env
    if command -v pg_dump >/dev/null 2>&1 && [[ -n "${DATABASE_URL:-}" ]]; then
      log "备份本机 PostgreSQL"
      pg_dump "$DATABASE_URL" > "$CURRENT_BACKUP/database.sql" || true
    fi
  fi
}

stop_current(){
  if [[ "${CURRENT_MODE:-}" == "docker" ]]; then
    (cd "$INSTALL_DIR" && docker compose down) || true
  else
    systemctl stop zonoe-api >/dev/null 2>&1 || true
  fi
}

restore_backup(){
  local b="${CURRENT_BACKUP:-}"
  [[ -n "$b" && -d "$b" ]] || return 1
  warn "部署失败，开始自动回滚: $b"
  find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 ! -name data ! -name backups ! -name .env -exec rm -rf {} + || true
  [[ -f "$b/program.tar.gz" ]] && tar -xzf "$b/program.tar.gz" -C "$INSTALL_DIR"
  [[ -f "$b/.env" ]] && cp "$b/.env" "$INSTALL_DIR/.env"

  if [[ "${CURRENT_MODE:-}" == "docker" && -f "$INSTALL_DIR/docker-compose.yml" ]] && command -v docker >/dev/null 2>&1; then
    (cd "$INSTALL_DIR" && docker compose up -d --build) || true
    return 0
  fi

  if [[ -x "$INSTALL_DIR/install.sh" || -f "$INSTALL_DIR/install.sh" ]]; then
    (cd "$INSTALL_DIR" && bash install.sh "${ZONOE_DOMAIN:-}") || true
  else
    systemctl restart zonoe-api >/dev/null 2>&1 || true
  fi
}

deploy_package(){
  local pkg="$1"
  [[ "$(id -u)" -eq 0 ]] || die "安装/更新需要 root 权限"
  need python3; need tar; need curl
  [[ -f "$pkg" ]] || die "部署包不存在: $pkg"

  local tmp; tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' RETURN
  safe_extract "$pkg" "$tmp/src"
  [[ -f "$tmp/src/install.sh" ]] || die "部署包缺少 install.sh"
  [[ -f "$tmp/src/package-lock.json" ]] || die "部署包缺少 package-lock.json"

  backup_current
  stop_current

  mkdir -p "$INSTALL_DIR/data/uploads" "$INSTALL_DIR/data/update-runtime" "$INSTALL_DIR/backups"
  local envtmp=''
  [[ -f "$INSTALL_DIR/.env" ]] && envtmp="$(mktemp)" && cp "$INSTALL_DIR/.env" "$envtmp"

  find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 ! -name data ! -name backups ! -name .env -exec rm -rf {} +
  cp -a "$tmp/src/." "$INSTALL_DIR/"
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
}
