#!/usr/bin/env bash
set -Eeuo pipefail

log(){ printf '\033[1;34m[ZONOE]\033[0m %s\n' "$*"; }
warn(){ printf '\033[1;33m[WARN]\033[0m %s\n' "$*" >&2; }
die(){ printf '\033[1;31m[ERROR]\033[0m %s\n' "$*" >&2; exit 1; }
need(){ command -v "$1" >/dev/null 2>&1 || die "缺少命令: $1"; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$ROOT/data"
LOG_FILE="$ROOT/data/install.log"
touch "$LOG_FILE"; chmod 600 "$LOG_FILE" || true
exec > >(tee -a "$LOG_FILE") 2>&1

DOMAIN="${1:-}"; DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN%%/*}"; [[ -n "$DOMAIN" ]] || DOMAIN="localhost"
SERVICE_NAME="zonoe-api"; RUNTIME_USER="zonoe"
export PATH="/www/server/mysql/bin:/usr/local/mysql/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"
[[ "$(id -u)" -eq 0 ]] || die "宝塔原生部署需要 root 权限执行 install.sh"

pkg_install(){
  if command -v apt-get >/dev/null 2>&1; then export DEBIAN_FRONTEND=noninteractive; apt-get update -y; apt-get install -y "$@";
  elif command -v dnf >/dev/null 2>&1; then dnf install -y "$@";
  elif command -v yum >/dev/null 2>&1; then yum install -y "$@";
  else die "无法识别系统包管理器"; fi
}

ensure_base_tools(){
  local missing=(); command -v curl >/dev/null 2>&1||missing+=(curl); command -v python3 >/dev/null 2>&1||missing+=(python3); command -v rsync >/dev/null 2>&1||missing+=(rsync); command -v openssl >/dev/null 2>&1||missing+=(openssl)
  ((${#missing[@]}))&&pkg_install "${missing[@]}"||true
}

ensure_node(){
  local major=0; command -v node >/dev/null 2>&1&&major="$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null||echo 0)"
  if [[ "$major" -ge 22 ]]&&command -v npm >/dev/null 2>&1; then return; fi
  log "安装 Node.js 22"; need curl
  if command -v apt-get >/dev/null 2>&1; then curl -fsSL https://deb.nodesource.com/setup_22.x|bash -; apt-get install -y nodejs;
  elif command -v dnf >/dev/null 2>&1||command -v yum >/dev/null 2>&1; then curl -fsSL https://rpm.nodesource.com/setup_22.x|bash -; command -v dnf >/dev/null 2>&1&&dnf install -y nodejs||yum install -y nodejs;
  else die "无法自动安装 Node.js 22"; fi
}

MYSQL_BIN_FOUND=""
ensure_mysql_client(){
  local p
  for p in /www/server/mysql/bin/mysql /usr/local/mysql/bin/mysql "$(command -v mysql 2>/dev/null||true)"; do
    [[ -n "$p"&&-x "$p" ]]&&MYSQL_BIN_FOUND="$p"&&break
  done
  if [[ -z "$MYSQL_BIN_FOUND" ]]; then
    log "安装 MySQL 客户端（仅客户端，不安装第二套数据库服务）"
    if command -v apt-get >/dev/null 2>&1; then pkg_install default-mysql-client;
    elif command -v dnf >/dev/null 2>&1; then pkg_install mariadb;
    elif command -v yum >/dev/null 2>&1; then pkg_install mariadb; fi
    MYSQL_BIN_FOUND="$(command -v mysql 2>/dev/null||true)"
  fi
  [[ -n "$MYSQL_BIN_FOUND" ]]||die "未找到 mysql 客户端。宝塔 MySQL 常见路径：/www/server/mysql/bin/mysql"
  log "MySQL 客户端: $MYSQL_BIN_FOUND"
}

random_hex(){ openssl rand -hex "${1:-24}"; }
set_env(){ local key="$1" value="$2"; python3 - "$ROOT/.env" "$key" "$value" <<'PY'
import pathlib,sys
p=pathlib.Path(sys.argv[1]); k=sys.argv[2]; v=sys.argv[3]; lines=p.read_text(encoding='utf-8').splitlines() if p.exists() else []; out=[]; found=False
for line in lines:
    if line.startswith(k+'='): out.append(f'{k}={v}'); found=True
    else: out.append(line)
if not found: out.append(f'{k}={v}')
p.write_text('\n'.join(out).rstrip()+'\n',encoding='utf-8')
PY
}
load_env(){ if [[ -f "$ROOT/.env" ]]; then set +u; set -a; source "$ROOT/.env"; set +a; set -u; fi; }

prepare_env(){
  mkdir -p "$ROOT/data/control" "$ROOT/data/update-runtime" "$ROOT/backups" "$ROOT/public"; chmod 700 "$ROOT/data/update-runtime"||true
  load_env
  local jwt="${JWT_SECRET:-}"; [[ ${#jwt} -ge 32&&"$jwt" != CHANGE_ME* ]]||jwt="$(random_hex 32)"
  local salt="${IP_HASH_SALT:-}"; [[ ${#salt} -ge 8&&"$salt" != CHANGE_ME* ]]||salt="$(random_hex 24)"
  local source_key="${SOURCE_CONFIG_KEY:-}"; [[ ${#source_key} -ge 16&&"$source_key" != CHANGE_ME* ]]||source_key="$(random_hex 32)"
  local admin_password="${ADMIN_PASSWORD:-}"; if [[ ! -f "$ROOT/data/control/admin.json" ]]; then [[ -n "$admin_password"&&"$admin_password" != CHANGE_ME* ]]||admin_password="Zonoe-$(random_hex 8)"; fi

  touch "$ROOT/.env"
  set_env NODE_ENV production; set_env HOST 127.0.0.1; set_env PORT 3000
  set_env PUBLIC_BASE_URL "${PUBLIC_BASE_URL:-http://$DOMAIN}"; set_env FRONTEND_ORIGIN "${FRONTEND_ORIGIN:-http://$DOMAIN}"
  set_env JWT_SECRET "$jwt"; set_env IP_HASH_SALT "$salt"; set_env SOURCE_CONFIG_KEY "$source_key"; set_env COOKIE_SECURE "${COOKIE_SECURE:-false}"
  set_env ADMIN_USERNAME "${ADMIN_USERNAME:-admin}"; [[ -n "$admin_password" ]]&&set_env ADMIN_PASSWORD "$admin_password"; set_env ADMIN_EMAIL "${ADMIN_EMAIL:-admin@$DOMAIN}"
  set_env CONTROL_DIR "$ROOT/data/control"; set_env MYSQL_BIN "$MYSQL_BIN_FOUND"; set_env DOWNLOAD_RATE_LIMIT "${DOWNLOAD_RATE_LIMIT:-120}"
  set_env GITHUB_REPOSITORY "${GITHUB_REPOSITORY:-a7987083/ipaxiazaizhan-}"; set_env GITHUB_RELEASE_CHANNEL "${GITHUB_RELEASE_CHANNEL:-stable}"
  set_env INSTALL_DIR "$ROOT"; set_env UPDATE_RUNTIME_DIR "$ROOT/data/update-runtime"; set_env VERSION_FILE "$ROOT/VERSION"; set_env DEPLOY_MODE native
  chmod 640 "$ROOT/.env"; load_env

  if [[ ! -f "$ROOT/data/install-info.txt" ]]; then
    cat > "$ROOT/data/install-info.txt" <<INFO
ZONOE IPA Download
Deploy Mode: native + existing MySQL software sources
Domain: $DOMAIN
Admin URL: http://$DOMAIN/admin
Username: ${ADMIN_USERNAME:-admin}
Bootstrap Password: ${admin_password:-已存在，请使用后台当前密码}
Generated: $(date -Iseconds)

提示：后台修改密码后，以后台新密码为准；.env 中 ADMIN_PASSWORD 仅用于首次初始化。
INFO
    chmod 600 "$ROOT/data/install-info.txt"
  fi
}

build_application(){
  log "安装 Node 依赖（root package-lock + npm ci）"; (cd "$ROOT"&&npm ci)
  log "执行 API 语法检查与 React Production Build"; (cd "$ROOT"&&npm run build)
  [[ -f "$ROOT/apps/web/dist/index.html" ]]||die "前端构建产物缺少 index.html"
  mkdir -p "$ROOT/public"
  rsync -a --delete --exclude='.user.ini' --exclude='.well-known/' --exclude='files' "$ROOT/apps/web/dist/" "$ROOT/public/"
}

ensure_runtime_user(){
  id "$RUNTIME_USER" >/dev/null 2>&1||useradd --system --home-dir "$ROOT" --shell /usr/sbin/nologin "$RUNTIME_USER"
  chown -R "$RUNTIME_USER:$RUNTIME_USER" "$ROOT/data"; chown root:"$RUNTIME_USER" "$ROOT/.env"; chmod 640 "$ROOT/.env"
}

write_systemd_service(){
  local node_bin="$(command -v node)"
  cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<UNIT
[Unit]
Description=ZONOE IPA Download API
After=network-online.target
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
  log "初始化本地控制数据（管理员/设置/软件源配置）"; (cd "$ROOT"&&node apps/api/src/db/migrate.js); (cd "$ROOT"&&node apps/api/src/db/seed.js)
  # migrate/seed 由 root 执行，首次创建的 0600 控制文件必须在服务启动前交还给 zonoe。
  chown -R "$RUNTIME_USER:$RUNTIME_USER" "$ROOT/data"
  systemctl enable --now "$SERVICE_NAME"; systemctl restart "$SERVICE_NAME"
  local ok=0; for _ in $(seq 1 40); do curl -fsS http://127.0.0.1:3000/healthz >/dev/null 2>&1&&ok=1&&break; sleep 1; done
  if [[ "$ok" != 1 ]]; then journalctl -u "$SERVICE_NAME" -n 80 --no-pager||true; die "API 健康检查失败"; fi
  local asset="$(grep -oE '/assets/[^"[:space:]]+\.js' "$ROOT/public/index.html"|head -n1||true)"; [[ -n "$asset"&&-f "$ROOT/public$asset" ]]||die "前端静态资源构建检查失败"
}

main(){
  ensure_base_tools; ensure_node; ensure_mysql_client; prepare_env; build_application; ensure_runtime_user; write_systemd_service; start_application
  touch "$ROOT/.zonoe-native-installed"
  log "宝塔原生部署完成（无 Docker；运行时不依赖 PostgreSQL）。"
  log "版本: $(tr -d '\r\n ' < "$ROOT/VERSION" 2>/dev/null||echo unknown)"
  log "应用数据: 后台添加一个或多个现有 MySQL 软件源；IPA 使用原地址，不复制。"
  log "站点目录: $ROOT/public"; log "API: http://127.0.0.1:3000"; log "安装日志: $LOG_FILE"; log "在线更新: 后台 → 在线更新，或 cd $ROOT && bash update.sh"
  if grep -q '^DATABASE_URL=postgres' "$ROOT/.env" 2>/dev/null; then warn "检测到旧 PostgreSQL 配置，仅保留以便回滚；1208 新运行时不会连接它。不要自动卸载系统 PostgreSQL，以免影响其他站点。"; fi
}
main "$@"