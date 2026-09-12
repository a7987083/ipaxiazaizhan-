#!/usr/bin/env bash
set -Eeuo pipefail

log(){ printf '\033[1;34m[ZONOE]\033[0m %s\n' "$*"; }
warn(){ printf '\033[1;33m[WARN]\033[0m %s\n' "$*" >&2; }
die(){ printf '\033[1;31m[ERROR]\033[0m %s\n' "$*" >&2; exit 1; }
need(){ command -v "$1" >/dev/null 2>&1 || die "缺少命令: $1"; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$ROOT/data"
LOG_FILE="$ROOT/data/install.log"
touch "$LOG_FILE"
chmod 600 "$LOG_FILE" || true
exec > >(tee -a "$LOG_FILE") 2>&1

DOMAIN="${1:-}"
DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN%%/*}"
[[ -n "$DOMAIN" ]] || DOMAIN="localhost"
SERVICE_NAME="zonoe-api"
RUNTIME_USER="zonoe"
export PATH="/www/server/pgsql/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"

[[ "$(id -u)" -eq 0 ]] || die "宝塔原生部署需要 root 权限执行 install.sh"

pkg_install(){
  if command -v apt-get >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y
    apt-get install -y "$@"
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y "$@"
  elif command -v yum >/dev/null 2>&1; then
    yum install -y "$@"
  else
    die "无法识别系统包管理器，请先安装 curl、python3、rsync、PostgreSQL 客户端/服务端和 Node.js 22"
  fi
}

ensure_base_tools(){
  local missing=()
  command -v curl >/dev/null 2>&1 || missing+=(curl)
  command -v python3 >/dev/null 2>&1 || missing+=(python3)
  command -v rsync >/dev/null 2>&1 || missing+=(rsync)
  command -v openssl >/dev/null 2>&1 || missing+=(openssl)
  if ((${#missing[@]})); then pkg_install "${missing[@]}"; fi
}

ensure_node(){
  local major=0
  if command -v node >/dev/null 2>&1; then
    major="$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)"
  fi
  if [[ "$major" -ge 22 ]] && command -v npm >/dev/null 2>&1; then return 0; fi
  need curl
  log "安装 Node.js 22"
  if command -v apt-get >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
  elif command -v dnf >/dev/null 2>&1 || command -v yum >/dev/null 2>&1; then
    curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
    if command -v dnf >/dev/null 2>&1; then dnf install -y nodejs; else yum install -y nodejs; fi
  else
    die "无法自动安装 Node.js 22"
  fi
  node -e 'if(Number(process.versions.node.split(".")[0])<22) process.exit(1)' || die "Node.js 22 安装失败"
}

ensure_postgres(){
  if ! command -v psql >/dev/null 2>&1 || ! command -v pg_dump >/dev/null 2>&1; then
    log "安装 PostgreSQL"
    if command -v apt-get >/dev/null 2>&1; then
      pkg_install postgresql postgresql-client
    elif command -v dnf >/dev/null 2>&1; then
      pkg_install postgresql-server postgresql
    elif command -v yum >/dev/null 2>&1; then
      pkg_install postgresql-server postgresql
    fi
  fi

  if command -v pg_isready >/dev/null 2>&1 && pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then return 0; fi

  if command -v postgresql-setup >/dev/null 2>&1 && [[ ! -s /var/lib/pgsql/data/PG_VERSION ]]; then
    postgresql-setup --initdb >/dev/null
  fi
  systemctl enable --now postgresql >/dev/null 2>&1 || true

  for unit in postgresql.service postgresql-16.service postgresql-15.service postgresql-14.service; do
    systemctl enable --now "$unit" >/dev/null 2>&1 || true
    if command -v pg_isready >/dev/null 2>&1 && pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then return 0; fi
  done

  for _ in $(seq 1 30); do
    if command -v pg_isready >/dev/null 2>&1 && pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  die "PostgreSQL 未能在 127.0.0.1:5432 启动"
}

random_hex(){ openssl rand -hex "${1:-24}"; }

set_env(){
  local key="$1" value="$2"
  python3 - "$ROOT/.env" "$key" "$value" <<'PY'
import pathlib,sys
p=pathlib.Path(sys.argv[1]); key=sys.argv[2]; value=sys.argv[3]
lines=p.read_text(encoding='utf-8').splitlines() if p.exists() else []
out=[]; found=False
for line in lines:
    if line.startswith(key+'='):
        out.append(f'{key}={value}'); found=True
    else:
        out.append(line)
if not found: out.append(f'{key}={value}')
p.write_text('\n'.join(out).rstrip()+'\n',encoding='utf-8')
PY
}

load_env(){
  if [[ -f "$ROOT/.env" ]]; then
    set +u
    set -a
    source "$ROOT/.env"
    set +a
    set -u
  fi
}

docker_migration_backup(){
  MIGRATION_DUMP=""
  if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1 || [[ ! -f "$ROOT/docker-compose.yml" ]]; then return 0; fi
  if ! (cd "$ROOT" && docker compose ps --status running --services 2>/dev/null | grep -qx postgres); then return 0; fi
  local dir="$ROOT/backups/native-migration-$(date +%Y%m%d_%H%M%S)"
  mkdir -p "$dir"
  log "检测到旧 Docker 部署，先导出 PostgreSQL 数据"
  (cd "$ROOT" && docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$dir/database.sql")
  [[ -f "$ROOT/.env" ]] && cp "$ROOT/.env" "$dir/.env"
  MIGRATION_DUMP="$dir/database.sql"
  log "停止旧 Docker 服务（保留 volume，不删除数据）"
  (cd "$ROOT" && docker compose down) || warn "旧 Docker 服务停止失败，请稍后手动检查"
}

prepare_env(){
  mkdir -p "$ROOT/data/uploads" "$ROOT/data/update-runtime" "$ROOT/backups"
  chmod 700 "$ROOT/data/update-runtime"

  load_env
  local db_password="${POSTGRES_PASSWORD:-}"
  [[ -n "$db_password" && "$db_password" != "CHANGE_ME_DB_PASSWORD" ]] || db_password="$(random_hex 20)"
  local jwt="${JWT_SECRET:-}"
  [[ ${#jwt} -ge 32 && "$jwt" != CHANGE_ME* ]] || jwt="$(random_hex 32)"
  local salt="${IP_HASH_SALT:-}"
  [[ ${#salt} -ge 8 && "$salt" != CHANGE_ME* ]] || salt="$(random_hex 24)"
  local source_key="${SOURCE_CONFIG_KEY:-}"
  [[ ${#source_key} -ge 16 && "$source_key" != CHANGE_ME* ]] || source_key="$(random_hex 32)"
  local admin_password="${ADMIN_PASSWORD:-}"
  [[ -n "$admin_password" && "$admin_password" != "CHANGE_ME_ADMIN_PASSWORD" ]] || admin_password="Zonoe-$(random_hex 8)"

  touch "$ROOT/.env"
  set_env NODE_ENV production
  set_env HOST 127.0.0.1
  set_env PORT 3000
  set_env PUBLIC_BASE_URL "${PUBLIC_BASE_URL:-http://$DOMAIN}"
  set_env FRONTEND_ORIGIN "${FRONTEND_ORIGIN:-http://$DOMAIN}"
  set_env POSTGRES_DB "${POSTGRES_DB:-zonoe}"
  set_env POSTGRES_USER "${POSTGRES_USER:-zonoe}"
  set_env POSTGRES_PASSWORD "$db_password"
  local db_password_url
  db_password_url="$(python3 - "$db_password" <<'PY'
import sys,urllib.parse
print(urllib.parse.quote(sys.argv[1],safe=''))
PY
)"
  set_env DATABASE_URL "postgresql://${POSTGRES_USER:-zonoe}:${db_password_url}@127.0.0.1:5432/${POSTGRES_DB:-zonoe}"
  if [[ "${REDIS_URL:-}" == redis://redis:* ]]; then set_env REDIS_URL ""; else set_env REDIS_URL "${REDIS_URL:-}"; fi
  set_env JWT_SECRET "$jwt"
  set_env IP_HASH_SALT "$salt"
  set_env SOURCE_CONFIG_KEY "$source_key"
  set_env COOKIE_SECURE "${COOKIE_SECURE:-false}"
  set_env ADMIN_USERNAME "${ADMIN_USERNAME:-admin}"
  set_env ADMIN_PASSWORD "$admin_password"
  set_env ADMIN_EMAIL "${ADMIN_EMAIL:-admin@$DOMAIN}"
  set_env LOCAL_STORAGE_DIR "$ROOT/data/uploads"
  set_env MAX_UPLOAD_MB "${MAX_UPLOAD_MB:-4096}"
  set_env DOWNLOAD_RATE_LIMIT "${DOWNLOAD_RATE_LIMIT:-120}"
  set_env GITHUB_REPOSITORY "${GITHUB_REPOSITORY:-a7987083/ipaxiazaizhan-}"
  set_env GITHUB_RELEASE_CHANNEL "${GITHUB_RELEASE_CHANNEL:-stable}"
  set_env INSTALL_DIR "$ROOT"
  set_env UPDATE_RUNTIME_DIR "$ROOT/data/update-runtime"
  set_env VERSION_FILE "$ROOT/VERSION"
  set_env DEPLOY_MODE native

  chmod 640 "$ROOT/.env"
  load_env

  if [[ ! -f "$ROOT/data/install-info.txt" ]]; then
    cat > "$ROOT/data/install-info.txt" <<INFO
ZONOE IPA Download
Deploy Mode: native
Domain: $DOMAIN
Admin URL: http://$DOMAIN/admin
Username: ${ADMIN_USERNAME:-admin}
Password: $admin_password
Generated: $(date -Iseconds)

启用 HTTPS 后请执行：
  bash scripts/enable-https.sh $DOMAIN
INFO
    chmod 600 "$ROOT/data/install-info.txt"
  fi
}

prepare_database(){
  need runuser
  [[ "${POSTGRES_DB:-}" =~ ^[A-Za-z0-9_]+$ ]] || die "POSTGRES_DB 只能包含字母、数字和下划线"
  [[ "${POSTGRES_USER:-}" =~ ^[A-Za-z0-9_]+$ ]] || die "POSTGRES_USER 只能包含字母、数字和下划线"

  runuser -u postgres -- psql -d postgres -tAc 'SELECT 1' >/dev/null || die "无法通过 postgres 系统用户管理本机 PostgreSQL"

  if ! runuser -u postgres -- psql -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='${POSTGRES_USER}'" | grep -q 1; then
    runuser -u postgres -- createuser "$POSTGRES_USER"
  fi
  runuser -u postgres -- psql -d postgres -v ON_ERROR_STOP=1 -v role="$POSTGRES_USER" -v dbpass="$POSTGRES_PASSWORD" >/dev/null <<'SQL'
ALTER ROLE :"role" WITH LOGIN PASSWORD :'dbpass';
SQL

  if ! runuser -u postgres -- psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${POSTGRES_DB}'" | grep -q 1; then
    runuser -u postgres -- createdb -O "$POSTGRES_USER" "$POSTGRES_DB"
  fi

  if [[ -n "${MIGRATION_DUMP:-}" && -s "$MIGRATION_DUMP" ]]; then
    local has_users
    has_users="$(psql "$DATABASE_URL" -tAc "SELECT to_regclass('public.users') IS NOT NULL" | tr -d '[:space:]')"
    if [[ "$has_users" != "t" ]]; then
      log "恢复旧 Docker PostgreSQL 数据到本机 PostgreSQL"
      psql "$DATABASE_URL" -v ON_ERROR_STOP=1 < "$MIGRATION_DUMP" >/dev/null
    else
      warn "本机数据库已有表，跳过 Docker 数据恢复；备份保留在 $MIGRATION_DUMP"
    fi
  fi
}

build_application(){
  log "安装 Node 依赖（root package-lock + npm ci）"
  (cd "$ROOT" && npm ci)
  log "执行 API 语法检查与 React Production Build"
  (cd "$ROOT" && npm run build)

  [[ -f "$ROOT/apps/web/dist/index.html" ]] || die "前端构建产物缺少 index.html"
  rm -rf "$ROOT/public"
  mkdir -p "$ROOT/public"
  cp -a "$ROOT/apps/web/dist/." "$ROOT/public/"
  ln -s "$ROOT/data/uploads" "$ROOT/public/files"
}

ensure_runtime_user(){
  if ! id "$RUNTIME_USER" >/dev/null 2>&1; then
    useradd --system --home-dir "$ROOT" --shell /usr/sbin/nologin "$RUNTIME_USER"
  fi
  chown -R "$RUNTIME_USER:$RUNTIME_USER" "$ROOT/data"
  chown root:"$RUNTIME_USER" "$ROOT/.env"
  chmod 640 "$ROOT/.env"
}

write_systemd_service(){
  local node_bin
  node_bin="$(command -v node)"
  cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<UNIT
[Unit]
Description=ZONOE IPA Download API
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=$RUNTIME_USER
Group=$RUNTIME_USER
WorkingDirectory=$ROOT
EnvironmentFile=$ROOT/.env
ExecStart=$node_bin $ROOT/apps/api/src/server.js
Restart=always
RestartSec=3
TimeoutStopSec=15
UMask=0027
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=$ROOT/data $ROOT/backups

[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload
}

start_application(){
  log "执行数据库 Migration / Seed"
  (cd "$ROOT" && node apps/api/src/db/migrate.js)
  (cd "$ROOT" && node apps/api/src/db/seed.js)

  systemctl enable --now "$SERVICE_NAME"
  systemctl restart "$SERVICE_NAME"

  local ok=0
  for _ in $(seq 1 40); do
    if curl -fsS http://127.0.0.1:3000/healthz >/dev/null 2>&1; then ok=1; break; fi
    sleep 1
  done
  if [[ "$ok" != 1 ]]; then
    journalctl -u "$SERVICE_NAME" -n 80 --no-pager || true
    die "API 健康检查失败"
  fi

  local asset
  asset="$(grep -oE '/assets/[^"[:space:]]+\.js' "$ROOT/public/index.html" | head -n1 || true)"
  [[ -n "$asset" && -f "$ROOT/public$asset" ]] || die "前端静态资源构建检查失败"
}

main(){
  ensure_base_tools
  ensure_node
  docker_migration_backup
  ensure_postgres
  prepare_env
  prepare_database
  build_application
  ensure_runtime_user
  write_systemd_service
  start_application
  touch "$ROOT/.zonoe-native-installed"
  chmod 600 "$ROOT/.zonoe-native-installed"
  log "宝塔原生部署完成（无 Docker）。"
  log "站点目录: $ROOT/public"
  log "API: http://127.0.0.1:3000"
  log "后台: http://$DOMAIN/admin"
  log "管理员信息: $ROOT/data/install-info.txt"
  log "安装日志: $LOG_FILE"
  log "宝塔网站运行目录必须设置为 /public，并加载 nginx.rewrite。"
}

main "$@"
