import fs from 'node:fs/promises';
import path from 'node:path';
import { CONTROL_DIR } from '../storage/controlStore.js';

export const RANGE_USAGE_FILE=path.join(CONTROL_DIR,'openlist-range-usage.json');
export const RANGE_HOURLY_LIMIT=10;
export const RANGE_DAILY_LIMIT=150;
const KEEP_DAYS=8;
const MAX_EVENTS=5000;
let writeQueue=Promise.resolve();

function num(v){const n=Number(v||0);return Number.isFinite(n)&&n>=0?Math.round(n):0}
function normalizeEvent(x={}){
  return {
    at:x.at||new Date().toISOString(),
    success:x.success===true,
    apiPath:String(x.apiPath||''),
    md5:String(x.md5||'').toUpperCase(),
    size:num(x.size),
    rangeBytes:num(x.rangeBytes),
    rangeRequests:num(x.rangeRequests),
    error:String(x.error||'').slice(0,500)
  };
}
function normalize(value={}){
  return {version:1,events:Array.isArray(value?.events)?value.events.map(normalizeEvent):[],updatedAt:value?.updatedAt||null};
}
function dayKey(ms){return new Date(ms).toISOString().slice(0,10)}

export function summarizeRangeUsage(events=[],now=Date.now()){
  const normalized=(events||[]).map(normalizeEvent).filter(x=>Number.isFinite(Date.parse(x.at)));
  const hourStart=now-60*60*1000,day=dayKey(now);
  const hour=normalized.filter(x=>Date.parse(x.at)>=hourStart);
  const today=normalized.filter(x=>dayKey(Date.parse(x.at))===day);
  const sum=list=>({
    attempts:list.length,
    success:list.filter(x=>x.success).length,
    failed:list.filter(x=>!x.success).length,
    rangeBytes:list.reduce((n,x)=>n+x.rangeBytes,0),
    rangeRequests:list.reduce((n,x)=>n+x.rangeRequests,0)
  });
  const h=sum(hour),d=sum(today);
  return {
    limits:{hourly:RANGE_HOURLY_LIMIT,daily:RANGE_DAILY_LIMIT},
    hour:{...h,remaining:Math.max(0,RANGE_HOURLY_LIMIT-h.attempts)},
    day:{...d,remaining:Math.max(0,RANGE_DAILY_LIMIT-d.attempts),date:day},
    recent:normalized.slice(-20).reverse()
  };
}

export async function readRangeUsage(){
  try{return normalize(JSON.parse(await fs.readFile(RANGE_USAGE_FILE,'utf8')))}
  catch(e){if(e?.code==='ENOENT')return {version:1,events:[],updatedAt:null};throw e}
}

export async function getRangeBudgetStatus(){
  const usage=await readRangeUsage();
  return summarizeRangeUsage(usage.events);
}

export async function appendRangeUsage(event){
  const usage=await readRangeUsage();
  const cutoff=Date.now()-KEEP_DAYS*24*60*60*1000;
  const events=[...usage.events,normalizeEvent(event)].filter(x=>Date.parse(x.at)>=cutoff).slice(-MAX_EVENTS);
  const next={version:1,events,updatedAt:new Date().toISOString()};
  await fs.mkdir(path.dirname(RANGE_USAGE_FILE),{recursive:true,mode:0o750});
  const body=JSON.stringify(next,null,2)+'\n';
  writeQueue=writeQueue.then(async()=>{
    const tmp=`${RANGE_USAGE_FILE}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tmp,body,{mode:0o600});
    await fs.rename(tmp,RANGE_USAGE_FILE);
    await fs.chmod(RANGE_USAGE_FILE,0o600).catch(()=>{});
  });
  await writeQueue;
  return summarizeRangeUsage(events);
}
