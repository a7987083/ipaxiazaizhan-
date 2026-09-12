#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="$(date +%Y%m%d_%H%M%S)"
DIR="$ROOT/backups/$STAMP"
mkdir -p "$DIR"
[[ -f "$ROOT/.env" ]] && cp "$ROOT/.env" "$DIR/.env"
[[ -f "$ROOT/VERSION" ]] && cp "$ROOT/VERSION" "$DIR/VERSION"
if [[ -d "$ROOT/data/control" ]]; then tar -C "$ROOT/data" -czf "$DIR/control.tar.gz" control; fi
chmod 600 "$DIR/.env" 2>/dev/null || true
cat > "$DIR/README.txt" <<'TXT'
1208+ 应用数据与 IPA 都保留在原 MySQL 软件源，本备份不会复制外部数据库或 IPA。
control.tar.gz 仅包含 ZONOE 管理员哈希、站点设置、加密的软件源连接配置与本地下载审计。
TXT
echo "$DIR"
