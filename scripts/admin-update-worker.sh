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
  local state="$1" message="$2" from="${3:-}" to="${4:-}" by="${5:-}" code="${6:-}" channel="${7:-}" target="${8:-}" step="${9:-}" progress="${10:-}" error_detail="${11:-}"
  python3 - "$STATUS" "$state" "$message" "$from" "$to" "$by" "$code" "$channel" "$target" "$step" "$progress" "$error_detail" <<'PY'
import json,os,sys,datetime
path,state,message,from_v,to_v,by,code,channel,target,step,progress,error_detail=sys.argv[1:]
obj={"state":state,"message":message,"updatedAt":datetime.datetime.now(datetime.timezone.utc).isoformat()}
if from_v: obj["fromVersion"]=from_v
if to_v: obj["toVersion"]=to_v
if by: obj["requestedBy"]=by
if code: obj["exitCode"]=int(code)
if channel: obj["channel"]=channel
if target: obj["targetVersion"]=target
if step: obj["step"]=step
if progress:
    try: obj["progress"]=max(0,min(100,int(progress)))
    except: pass
if error_detail: obj["errorDetail"]=error_detail[:500]
tmp=path+".tmp"
with open(tmp,"w",encoding="utf-8") as f:
    json.dump(obj,f,ensure_ascii=False,indent=2)
    f.write("\n")
os.replace(tmp,path)
PY
  chmod 640 "$STATUS" || true
  if id zonoe >/dev/null 2>&1; then chown zonoe:zonoe "$STATUS" || true; fi
}

progress_from_log(){
  python3 - "$LOG" "$1" <<'PY'
import re,sys
p=sys.argv[1]; start=int(sys.argv[2])
try:
    lines=open(p,encoding='utf-8',errors='replace').read().splitlines()[start:]
except Exception:
    lines=[]
text='\n'.join(lines)
steps=[
 (10,'checking','正在检查目标版本和 GitHub 提交',r'查询 GitHub'),
 (20,'downloading','正在下载更新包',r'下载部署包|下载 Preview'),
 (30,'verifying','正在校验更新包',r'SHA256|校验完成'),
 (40,'backup','正在备份当前程序和持久配置',r'备份当前程序|持久配置快照'),
 (48,'dependencies-snapshot','正在保护当前 Node 依赖',r'保存当前 Node 依赖快照'),
 (58,'dependencies','正在安装 Node 依赖',r'安装 Node 依赖'),
 (70,'build','正在执行生产构建和语法检查',r'执行 API 语法检查|Production Build'),
 (80,'control','正在初始化并校验控制数据',r'初始化本地控制数据'),
 (88,'restore-config','正在恢复更新前配置并校验',r'恢复更新前持久配置'),
 (92,'restart','正在重启 API 并等待健康检查',r'重启 API 并校验持久配置|健康检查'),
 (96,'finalizing','正在完成部署',r'部署完成，版本'),
 (99,'finalizing','正在写入更新结果',r'在线更新完成')
]
progress,step,msg=5,'preparing','正在准备更新任务'
for pr,st,ms,pat in steps:
    if re.search(pat,text,re.I): progress,step,msg=pr,st,ms
print(progress); print(step); print(msg)
PY
}

last_error_from_log(){
  python3 - "$LOG" "$1" <<'PY'
import re,sys
p=sys.argv[1]; start=int(sys.argv[2])
try: lines=open(p,encoding='utf-8',errors='replace').read().splitlines()[start:]
except Exception: lines=[]
chosen=''
for line in lines:
    s=line.strip()
    if not s: continue
    if re.search(r'\[ERROR\]|npm (ERR|error)|失败|failed|fatal|permission denied|EACCES|ENOENT|502|503',s,re.I): chosen=s
if not chosen and lines:
    chosen=next((x.strip() for x in reversed(lines) if x.strip()),'')
chosen=re.sub(r'Bearer\s+\S+','Bearer ***',chosen,flags=re.I)
chosen=re.sub(r'([?&](?:token|signature|sig|key|password)=)[^&\s]+',r'\1***',chosen,flags=re.I)
print(chosen[:360])
PY
}

[[ -f "$REQUEST" ]] || exit 0

mapfile -t REQ < <(python3 - "$REQUEST" <<'PY'
import json,re,sys
try: j=json.load(open(sys.argv[1],encoding='utf-8'))
except Exception: j={}
channel=str(j.get("channel") or "stable")
ref=str(j.get("ref") or "")
target=str(j.get("targetVersion") or "")
by=str(j.get("requestedBy") or "admin").replace("\n"," ")[:120]
if channel not in {"stable","preview"}: raise SystemExit("invalid channel")
if channel=="preview" and not re.fullmatch(r"[0-9a-f]{40}",ref): raise SystemExit("invalid preview ref")
if target and not re.fullmatch(r"20\d{8,12}",target): raise SystemExit("invalid target version")
print(channel); print(ref); print(target); print(by)
PY
) || {
  rm -f "$REQUEST"
  write_status failed "[0%] 在线更新请求格式无效" "" "" "admin" 2 "" "" "request" 0 "请求格式校验失败"
  exit 2
}
CHANNEL="${REQ[0]:-stable}"
REF="${REQ[1]:-}"
TARGET="${REQ[2]:-}"
REQUESTED_BY="${REQ[3]:-admin}"
FROM="$(tr -d '\r\n ' < "$ROOT/VERSION" 2>/dev/null || echo unknown)"
rm -f "$REQUEST"
START_LINE="$(wc -l < "$LOG" 2>/dev/null || echo 0)"

if [[ "$CHANNEL" == "preview" ]]; then
  write_status running "[5%] 正在准备 Preview 更新" "$FROM" "" "$REQUESTED_BY" "" "$CHANNEL" "$TARGET" preparing 5
else
  write_status running "[5%] 正在准备 Stable 更新" "$FROM" "" "$REQUESTED_BY" "" "$CHANNEL" "$TARGET" preparing 5
fi

set +e
if [[ "$CHANNEL" == "preview" ]]; then
  /bin/bash "$ROOT/update.sh" --ref "$REF" >>"$LOG" 2>&1 &
else
  /bin/bash "$ROOT/update.sh" --stable >>"$LOG" 2>&1 &
fi
PID=$!
LAST_SIG=''
while kill -0 "$PID" >/dev/null 2>&1; do
  mapfile -t P < <(progress_from_log "$START_LINE")
  PROGRESS="${P[0]:-5}"; STEP="${P[1]:-preparing}"; MSG="${P[2]:-正在执行更新}"
  SIG="$PROGRESS|$STEP|$MSG"
  if [[ "$SIG" != "$LAST_SIG" ]]; then
    write_status running "[$PROGRESS%] $MSG" "$FROM" "" "$REQUESTED_BY" "" "$CHANNEL" "$TARGET" "$STEP" "$PROGRESS"
    LAST_SIG="$SIG"
  fi
  sleep 1
 done
wait "$PID"
RC=$?
set -e

TO="$(tr -d '\r\n ' < "$ROOT/VERSION" 2>/dev/null || echo unknown)"
if [[ "$RC" -eq 0 ]]; then
  write_status success "[100%] 在线更新完成：$FROM → $TO；配置已保留并通过健康检查" "$FROM" "$TO" "$REQUESTED_BY" 0 "$CHANNEL" "$TARGET" completed 100
else
  DETAIL="$(last_error_from_log "$START_LINE")"
  [[ -n "$DETAIL" ]] || DETAIL="更新进程退出码 $RC"
  write_status failed "[100%] 在线更新失败：$DETAIL" "$FROM" "$TO" "$REQUESTED_BY" "$RC" "$CHANNEL" "$TARGET" failed 100 "$DETAIL"
fi
exit "$RC"
