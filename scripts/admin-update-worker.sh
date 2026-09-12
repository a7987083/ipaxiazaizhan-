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
  local state="$1" message="$2" from="${3:-}" to="${4:-}" by="${5:-}" code="${6:-}"
  python3 - "$STATUS" "$state" "$message" "$from" "$to" "$by" "$code" <<'PY'
import json,os,sys,datetime
path,state,message,from_v,to_v,by,code=sys.argv[1:]
obj={
  "state":state,
  "message":message,
  "updatedAt":datetime.datetime.now(datetime.timezone.utc).isoformat()
}
if from_v: obj["fromVersion"]=from_v
if to_v: obj["toVersion"]=to_v
if by: obj["requestedBy"]=by
if code: obj["exitCode"]=int(code)
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
import json,sys
try:
    j=json.load(open(sys.argv[1],encoding="utf-8"))
except Exception:
    j={}
print("1" if j.get("force") is True else "0")
print(str(j.get("requestedBy") or "admin").replace("\n"," ")[:120])
PY
)
FORCE="${REQ[0]:-0}"
REQUESTED_BY="${REQ[1]:-admin}"
FROM="$(tr -d '\r\n ' < "$ROOT/VERSION" 2>/dev/null || echo unknown)"
rm -f "$REQUEST"

write_status running "正在从 GitHub 下载、校验并安装更新" "$FROM" "" "$REQUESTED_BY"

set +e
if [[ "$FORCE" == "1" ]]; then
  /bin/bash "$ROOT/update.sh" --force >>"$LOG" 2>&1
else
  /bin/bash "$ROOT/update.sh" >>"$LOG" 2>&1
fi
RC=$?
set -e

TO="$(tr -d '\r\n ' < "$ROOT/VERSION" 2>/dev/null || echo unknown)"
if [[ "$RC" -eq 0 ]]; then
  write_status success "在线更新完成" "$FROM" "$TO" "$REQUESTED_BY" 0
else
  write_status failed "在线更新失败；程序已按更新引擎策略尝试回滚，请查看 data/update-runtime/admin-update.log" "$FROM" "$TO" "$REQUESTED_BY" "$RC"
fi
exit "$RC"
