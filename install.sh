#!/usr/bin/env bash
set -Eeuo pipefail

log(){ printf '\033[1;34m[ZONOE]\033[0m %s\n' "$*"; }
die(){ printf '\033[1;31m[ERROR]\033[0m %s\n' "$*" >&2; exit 1; }
need(){ command -v "$1" >/dev/null 2>&1 || die "缺少命令: $1"; }

ROOT="$(pwd)"
DOMAIN="${1:-}"
DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN%%/*}"
[[ -n "$DOMAIN" ]] || DOMAIN="localhost"
MARKER="$ROOT/.zonoe-baota-installed"
HTTP_PORT=18081
HTTPS_PORT=18443

[[ "$(id -u)" -eq 0 ]] || die "宝塔一键部署需要 root 权限执行 install.sh"

if [[ -f "$MARKER" && -f "$ROOT/.env" ]]; then
  log "检测到已完成的一键部署，跳过重复初始化。"
  exit 0
fi

ensure_curl(){
  if command -v curl >/dev/null 2>&1; then return 0; fi
  if command -v apt-get >/dev/null 2>&1; then apt-get update -y && apt-get install -y curl ca-certificates;
  elif command -v dnf >/dev/null 2>&1; then dnf install -y curl ca-certificates;
  elif command -v yum >/dev/null 2>&1; then yum install -y curl ca-certificates;
  else die "系统缺少 curl，且无法识别包管理器"; fi
}

ensure_docker(){
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then return 0; fi
  ensure_curl
  log "未检测到 Docker Compose v2，使用 Docker 官方安装脚本安装。"
  curl -fsSL --retry 3 https://get.docker.com -o /tmp/zonoe-get-docker.sh
  sh /tmp/zonoe-get-docker.sh
  rm -f /tmp/zonoe-get-docker.sh
  systemctl enable --now docker >/dev/null 2>&1 || true
  command -v docker >/dev/null 2>&1 || die "Docker 安装失败"
  docker compose version >/dev/null 2>&1 || die "Docker Compose v2 不可用"
}

random_hex(){
  if command -v openssl >/dev/null 2>&1; then openssl rand -hex "${1:-24}"; else head -c "${1:-24}" /dev/urandom | od -An -tx1 | tr -d ' \n'; fi
}

ensure_port_free(){
  local port="$1"
  if command -v ss >/dev/null 2>&1 && ss -ltnH 2>/dev/null | awk '{print $4}' | grep -Eq "(^|:)$port$"; then
    die "本机 127.0.0.1:$port 已被占用。为避免覆盖其它服务，已停止部署。"
  fi
}

ensure_docker
need sha256sum
ensure_port_free "$HTTP_PORT"

mkdir -p "$ROOT/data/uploads" "$ROOT/data/update-runtime" "$ROOT/backups"
chmod 700 "$ROOT/data/update-runtime"

if [[ ! -f "$ROOT/.env" ]]; then
  DB_PASSWORD="$(random_hex 20)"
  JWT_SECRET="$(random_hex 32)"
  IP_HASH_SALT="$(random_hex 24)"
  SOURCE_CONFIG_KEY="$(random_hex 32)"
  ADMIN_PASSWORD="Zonoe-$(random_hex 8)"
  cat > "$ROOT/.env" <<ENV
NODE_ENV=production
PORT=3000
PUBLIC_BASE_URL=http://$DOMAIN
FRONTEND_ORIGIN=http://$DOMAIN
POSTGRES_DB=zonoe
POSTGRES_USER=zonoe
POSTGRES_PASSWORD=$DB_PASSWORD
DATABASE_URL=postgresql://zonoe:$DB_PASSWORD@postgres:5432/zonoe
REDIS_URL=redis://redis:6379
JWT_SECRET=$JWT_SECRET
IP_HASH_SALT=$IP_HASH_SALT
SOURCE_CONFIG_KEY=$SOURCE_CONFIG_KEY
COOKIE_SECURE=false
ADMIN_USERNAME=admin
ADMIN_PASSWORD=$ADMIN_PASSWORD
ADMIN_EMAIL=admin@$DOMAIN
LOCAL_STORAGE_DIR=/data/uploads
MAX_UPLOAD_MB=4096
DOWNLOAD_RATE_LIMIT=120
GITHUB_REPOSITORY=a7987083/ipaxiazaizhan-
GITHUB_RELEASE_CHANNEL=stable
INSTALL_DIR=$ROOT
NGINX_HTTP_BIND=127.0.0.1:$HTTP_PORT
NGINX_HTTPS_BIND=127.0.0.1:$HTTPS_PORT
UPDATE_RUNTIME_DIR=/runtime/update
VERSION_FILE=/app/VERSION
ENV
  umask 077
  cat > "$ROOT/data/install-info.txt" <<INFO
ZONOE IPA Download
Domain: $DOMAIN
Admin URL: http://$DOMAIN/admin
Username: admin
Password: $ADMIN_PASSWORD
Generated: $(date -Iseconds)

首次启用 HTTPS 后，可将 .env 中：
PUBLIC_BASE_URL / FRONTEND_ORIGIN 改为 https://$DOMAIN
COOKIE_SECURE 改为 true
然后执行：docker compose up -d --build
INFO
  chmod 600 "$ROOT/.env" "$ROOT/data/install-info.txt"
fi

chmod +x "$ROOT/install.sh" "$ROOT/insatll.sh" "$ROOT/update.sh" "$ROOT/install-online.sh" "$ROOT/scripts/"*.sh || true

log "构建并启动 PostgreSQL / Redis / API / Web / 内部 Nginx"
(cd "$ROOT" && docker compose up -d --build)

log "等待内部健康检查"
ok=0
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${HTTP_PORT}/healthz" >/dev/null 2>&1; then
    html="$(curl -fsS "http://127.0.0.1:${HTTP_PORT}/" 2>/dev/null || true)"
    asset="$(printf '%s' "$html" | grep -oE '/assets/[^"[:space:]]+\.js' | head -n1 || true)"
    if [[ -n "$asset" ]] && curl -fsS "http://127.0.0.1:${HTTP_PORT}${asset}" >/dev/null 2>&1; then ok=1; break; fi
  fi
  sleep 2
done
[[ "$ok" -eq 1 ]] || { (cd "$ROOT" && docker compose ps) || true; die "服务健康检查失败：API 或前端静态资源不可用"; }

(cd "$ROOT" && docker compose exec -T api npm run seed) || die "管理员初始化失败"
touch "$MARKER"
chmod 600 "$MARKER"
log "宝塔一键部署完成。"
log "站点: http://$DOMAIN"
log "后台: http://$DOMAIN/admin"
log "管理员凭据已写入: $ROOT/data/install-info.txt"
