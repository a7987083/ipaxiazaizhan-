#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUNTIME="$ROOT/data/update-runtime"
REQUEST="$RUNTIME/admin-update-request.json"
STATUS="$RUNTIME/admin-update-status.json"
LOG="$RUNTIME/admin-update.log"

mkdir -p "$RUNTIME"
touch "$LOG"
chmod 600 "$LOG" || true

write_status(){
  local state="$1" message="$2" from="${3:-}" to="${4:-}" by="${5:-}" code="${6:-}" channel="${7:-}" target="${8:-}"
  python3 - "$STATUS" "$state" "$message" "$from" "$to" "$by" "$code" "$channel" "$target" <<'PY'
import json,os,sys,datetime
path,state,message,from_v,to_v,by,code,channel,target=sys.argv[1:]
obj={
  "state":state,
  "message":message,
  "updatedAt":datetime.datetime.now(datetime.timezone.utc).isoformat()
}
if from_v: obj["fromVersion"]=from_v
if to_v: obj["toVersion"]=to_v
if by: obj["requestedBy"]=by
if code: obj["exitCode"]=int(code)
if channel: obj["channel"]=channel
if target: obj["targetVersion"]=target
tmp=path+".tmp"
with open(tmp,"w",encoding="utf-8") as f:
    json.dump(obj,f,ensure_ascii=False,indent=2)
    f.write("\n")
os.replace(tmp,path)
PY
  chmod 640 "$STATUS" || true
  if id zonoe >/dev/null 2>&1; then chown zonoe:zonoe "$STATUS" || true; fi
}

[[ -f "$REQUEST" ]] || exit 0

mapfile -t REQ < <(python3 - "$REQUEST" <<'PY'
import json,re,sys
try:
    j=json.load(open(sys.argv[1],encoding="utf-8"))
except Exception:
    j={}
channel=str(j.get("channel") or "stable")
ref=str(j.get("ref") or "")
target=str(j.get("targetVersion") or "")
by=str(j.get("requestedBy") or "admin").replace("\n"," ")[:120]
if channel not in {"stable","preview"}:
    raise SystemExit("invalid channel")
if channel=="preview" and not re.fullmatch(r"[0-9a-f]{40}",ref):
    raise SystemExit("invalid preview ref")
if target and not re.fullmatch(r"20\d{8,12}",target):
    raise SystemExit("invalid target version")
print(channel)
print(ref)
print(target)
print(by)
PY
) || {
  rm -f "$REQUEST"
  write_status failed "在线更新请求格式无效" "" "" "admin" 2
  exit 2
}
CHANNEL="${REQ[0]:-stable}"
REF="${REQ[1]:-}"
TARGET="${REQ[2]:-}"
REQUESTED_BY="${REQ[3]:-admin}"
FROM="$(tr -d '\r\n ' < "$ROOT/VERSION" 2>/dev/null || echo unknown)"
rm -f "$REQUEST"

if [[ "$CHANNEL" == "preview" ]]; then
  write_status running "正在从 Preview CI 构建下载、校验并安装更新" "$FROM" "" "$REQUESTED_BY" "" "$CHANNEL" "$TARGET"
else
  write_status running "正在从 Stable Release 下载、校验并安装更新" "$FROM" "" "$REQUESTED_BY" "" "$CHANNEL" "$TARGET"
fi

set +e
if [[ "$CHANNEL" == "preview" ]]; then
  /bin/bash "$ROOT/update.sh" --ref "$REF" >>"$LOG" 2>&1
else
  /bin/bash "$ROOT/update.sh" --stable >>"$LOG" 2>&1
fi
RC=$?
set -e

TO="$(tr -d '\r\n ' < "$ROOT/VERSION" 2>/dev/null || echo unknown)"
if [[ "$RC" -eq 0 ]]; then
  write_status success "在线更新完成" "$FROM" "$TO" "$REQUESTED_BY" 0 "$CHANNEL" "$TARGET"
else
  write_status failed "在线更新失败；程序已按更新引擎策略尝试回滚，请查看 data/update-runtime/admin-update.log" "$FROM" "$TO" "$REQUESTED_BY" "$RC" "$CHANNEL" "$TARGET"
fi
exit "$RC"
