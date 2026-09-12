#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOMAIN="${1:-}"
DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN%%/*}"
[[ -n "$DOMAIN" ]] || { echo "用法: sudo bash scripts/enable-https.sh your.domain" >&2; exit 2; }
[[ -f "$ROOT/.env" ]] || { echo "缺少 $ROOT/.env" >&2; exit 1; }
python3 - "$ROOT/.env" "$DOMAIN" <<'PY'
import pathlib,sys
p=pathlib.Path(sys.argv[1]); domain=sys.argv[2]
updates={
 'PUBLIC_BASE_URL':f'https://{domain}',
 'FRONTEND_ORIGIN':f'https://{domain}',
 'COOKIE_SECURE':'true',
}
lines=p.read_text(encoding='utf-8').splitlines()
seen=set(); out=[]
for line in lines:
    key=line.split('=',1)[0] if '=' in line else ''
    if key in updates:
        out.append(f'{key}={updates[key]}'); seen.add(key)
    else:
        out.append(line)
for k,v in updates.items():
    if k not in seen: out.append(f'{k}={v}')
p.write_text('\n'.join(out).rstrip()+'\n',encoding='utf-8')
PY
systemctl restart zonoe-api
echo "HTTPS 配置已更新: https://$DOMAIN"
