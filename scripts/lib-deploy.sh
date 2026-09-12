#!/usr/bin/env bash
set -Eeuo pipefail

log(){ printf '\033[1;34m[ZONOE]\033[0m %s\n' "$*"; }
die(){ printf '\033[1;31m[ERROR]\033[0m %s\n' "$*" >&2; exit 1; }
need(){ command -v "$1" >/dev/null 2>&1 || die "缺少命令: $1"; }

INSTALL_DIR="${INSTALL_DIR:-/opt/zonoe-ipa-download}"
BACKUP_ROOT="${BACKUP_ROOT:-$INSTALL_DIR/backups}"

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

backup_current(){
  mkdir -p "$BACKUP_ROOT"
  local stamp; stamp="$(date +%Y%m%d_%H%M%S)"
  CURRENT_BACKUP="$BACKUP_ROOT/$stamp"
  mkdir -p "$CURRENT_BACKUP"
  if [[ -f "$INSTALL_DIR/docker-compose.yml" ]]; then
    log "备份当前程序 -> $CURRENT_BACKUP/program.tar.gz"
    tar --exclude='./backups' --exclude='./data' --exclude='./.env' -C "$INSTALL_DIR" -czf "$CURRENT_BACKUP/program.tar.gz" . || true
    [[ -f "$INSTALL_DIR/.env" ]] && cp "$INSTALL_DIR/.env" "$CURRENT_BACKUP/.env"
    if docker compose -f "$INSTALL_DIR/docker-compose.yml" ps postgres >/dev/null 2>&1; then
      log "备份 PostgreSQL"
      (cd "$INSTALL_DIR" && docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$CURRENT_BACKUP/database.sql") || true
    fi
  fi
}

restore_backup(){
  local b="${CURRENT_BACKUP:-}"
  [[ -n "$b" && -d "$b" ]] || return 1
  log "部署失败，开始自动回滚: $b"
  if [[ -f "$b/program.tar.gz" ]]; then
    find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 ! -name data ! -name backups ! -name .env -exec rm -rf {} +
    tar -xzf "$b/program.tar.gz" -C "$INSTALL_DIR"
  fi
  [[ -f "$b/.env" ]] && cp "$b/.env" "$INSTALL_DIR/.env"
  (cd "$INSTALL_DIR" && docker compose up -d --build) || true
  if [[ -s "$b/database.sql" ]]; then
    (cd "$INSTALL_DIR" && docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"' < "$b/database.sql") || true
  fi
}

deploy_package(){
  local pkg="$1"
  need docker; need python3; need tar
  docker compose version >/dev/null 2>&1 || die "Docker Compose v2 不可用"
  [[ -f "$pkg" ]] || die "部署包不存在: $pkg"
  local tmp; tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' RETURN
  safe_extract "$pkg" "$tmp/src"
  [[ -f "$tmp/src/docker-compose.yml" ]] || die "部署包缺少 docker-compose.yml"
  backup_current
  mkdir -p "$INSTALL_DIR/data/uploads" "$INSTALL_DIR/backups"
  local envtmp=''
  [[ -f "$INSTALL_DIR/.env" ]] && envtmp="$(mktemp)" && cp "$INSTALL_DIR/.env" "$envtmp"
  find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 ! -name data ! -name backups ! -name .env -exec rm -rf {} +
  cp -a "$tmp/src/." "$INSTALL_DIR/"
  if [[ -n "$envtmp" ]]; then cp "$envtmp" "$INSTALL_DIR/.env"; rm -f "$envtmp"; fi
  if [[ ! -f "$INSTALL_DIR/.env" ]]; then
    cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env"
    log "首次安装已生成 $INSTALL_DIR/.env，请先修改密码和 Secret 后重新执行本脚本。"
    return 10
  fi
  chmod +x "$INSTALL_DIR"/scripts/*.sh || true
  log "启动容器并执行数据库 Migration"
  if ! (cd "$INSTALL_DIR" && docker compose up -d --build); then restore_backup; return 1; fi
  log "等待服务健康"
  local ok=0
  for _ in $(seq 1 30); do
    if curl -fsS http://127.0.0.1/healthz >/dev/null 2>&1; then ok=1; break; fi
    sleep 2
  done
  if [[ "$ok" != 1 ]]; then restore_backup; die "健康检查失败，已尝试自动回滚"; fi
  (cd "$INSTALL_DIR" && docker compose exec -T api npm run seed) || true
  log "部署完成，版本: $(cat "$INSTALL_DIR/VERSION" 2>/dev/null || echo unknown)"
}
