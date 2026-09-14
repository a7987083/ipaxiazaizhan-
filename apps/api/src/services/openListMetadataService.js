import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listMysqlSources,getOpenListConfig,readOpenListIpaCache,writeOpenListIpaCache,
  readOpenListDirectoryCache,writeOpenListDirectoryCache,readOpenListTask,writeOpenListTask
} from '../storage/controlStore.js';
import { fromHex, parseTsv, runMysql, safeIdentifier } from './mysqlCli.js';
import {
  getParsedMetadataByMd5,loadAndSeedIpaMetadataLibrary,normalizeMd5,
  rememberParsedMetadata,writeIpaMetadataLibrary
} from './ipaMetadataLibrary.js';
import { appendRangeUsage,getRangeBudgetStatus } from './rangeUsageService.js';

const PARSER = fileURLToPath(new URL('../../../../scripts/ipa-range-info.py', import.meta.url));
const DIRECTORY_CACHE_TTL_MS = 30*60*1000;
const PARSE_RETRY_DELAY_MS = 30*60*1000;
export const RECOMMENDED_OPENLIST_SCHEDULE={intervalMinutes:15,parseLimit:1,label:'建议默认：每 15 分钟解析 1 个；可自定义 5–1440 分钟 / 每轮 1–20 个；小时 10 个 / 每日 150 个硬预算'};

let taskLocked=false;
let schedulerTimer=null;
let nextScheduledAt=null;

function cleanBasePath(v='/') {
  let s=String(v||'/').trim();
  if(!s.startsWith('/')) s=`/${s}`;
  while(s.includes('//')) s=s.replaceAll('//','/');
  while(s.length>1 && s.endsWith('/')) s=s.slice(0,-1);
  return s || '/';
}
function cleanPrefix(v='/d/a/app/') {
  let s=String(v||'/d/a/app/').trim();
  try { s=decodeURIComponent(s); } catch {}
  if(!s.startsWith('/')) s=`/${s}`;
  while(s.includes('//')) s=s.replaceAll('//','/');
  if(!s.endsWith('/')) s+='/' ;
  return s;
}
function joinApiPath(base,relative) {
  let rel=String(relative||''); while(rel.startsWith('/')) rel=rel.slice(1);
  const parts=rel.split('/').filter(Boolean);
  if(parts.some(x=>x==='..')) return null;
  const out=path.posix.join(cleanBasePath(base),...parts);
  return out.startsWith('/')?out:`/${out}`;
}
function numericSize(v){ const n=Number(String(v??'').trim()); return Number.isFinite(n)&&n>=0?Math.round(n):null; }
export function safeAppRef(ref={}) {
  return {
    appKey:String(ref.appKey||''),sourceSlug:String(ref.sourceSlug||''),sourceName:String(ref.sourceName||''),
    legacyId:Number(ref.legacyId||0),name:String(ref.name||''),version:String(ref.version||''),
    dbSize:numericSize(ref.dbSize),apiPath:String(ref.apiPath||'')
  };
}
export function auditIpaResult(ref={},file={}) {
  const meta=file?.parsed||{};
  const sourceVersion=String(ref.version||'').trim();
  const packageVersion=String(meta.version||'').trim();
  const versionMismatch=Boolean(sourceVersion&&packageVersion&&sourceVersion!==packageVersion);
  const dbSize=Number(ref.dbSize||0),actualSize=Number(file?.size||0);
  const sizeDelta=dbSize>0&&actualSize>0?Math.abs(dbSize-actualSize):0;
  const sizeTolerance=actualSize>0?Math.max(1024*1024,Math.round(actualSize*0.01)):0;
  const sizeMismatch=Boolean(dbSize>0&&actualSize>0&&sizeDelta>sizeTolerance);
  return {versionMismatch,sizeMismatch,mismatch:versionMismatch||sizeMismatch,sizeDelta,sizeTolerance};
}
function nowIso(){ return new Date().toISOString(); }
function taskId(){ return `${Date.now()}-${Math.random().toString(36).slice(2,8)}`; }
function tokenFingerprint(token){return createHash('sha256').update(String(token||'')).digest('hex').slice(0,16)}
function cacheScopeKey(config){ return `${String(config.url||'').replace(/\/+$/,'')}|${cleanBasePath(config.apiBasePath||'/')}|${cleanPrefix(config.publicPathPrefix||'/d/a/app/')}|${tokenFingerprint(config.token)}`; }
function cacheFresh(fetchedAt){ const t=Date.parse(String(fetchedAt||'')); return Number.isFinite(t) && Date.now()-t<DIRECTORY_CACHE_TTL_MS; }
function effectiveSchedule(schedule={}){
  return {
    enabled:schedule?.enabled===true,
    intervalMinutes:Math.min(1440,Math.max(5,Number(schedule?.intervalMinutes)||15)),
    parseLimit:Math.min(20,Math.max(1,Number(schedule?.parseLimit)||1))
  };
}

export function publicUrlToApiPath(rawUrl, config) {
  try {
    const base=new URL(config.url);
    const u=new URL(String(rawUrl||'').trim());
    if(u.hostname.toLowerCase()!==base.hostname.toLowerCase()) return null;
    let pathname=u.pathname;
    try { pathname=decodeURIComponent(pathname); } catch {}
    const prefix=cleanPrefix(config.publicPathPrefix);
    if(!pathname.startsWith(prefix)) return null;
    return joinApiPath(config.apiBasePath,pathname.slice(prefix.length));
  } catch { return null; }
}

export function metadataChanged(oldFile,nextFile) {
  if(!oldFile) return true;
  const oldMd5=String(oldFile.md5||'').toUpperCase();
  const newMd5=String(nextFile.md5||'').toUpperCase();
  if(oldMd5 && newMd5) return oldMd5!==newMd5;
  return Number(oldFile.size||0)!==Number(nextFile.size||0) || String(oldFile.modified||'')!==String(nextFile.modified||'');
}

function hashMd5(item) {
  if(item?.hash_info?.md5) return String(item.hash_info.md5).toUpperCase();
  try { const j=JSON.parse(item?.hashinfo||'{}'); return String(j?.md5||'').toUpperCase(); } catch { return ''; }
}

async function openListJson(config, apiPath, body, timeoutMs=20000) {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try {
    let baseUrl=String(config.url); while(baseUrl.endsWith('/')) baseUrl=baseUrl.slice(0,-1);
    const res=await fetch(`${baseUrl}${apiPath}`,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':config.token,'User-Agent':'zonoe-openlist-metadata/1.2'},
      body:JSON.stringify(body),signal:controller.signal
    });
    const json=await res.json().catch(()=>null);
    if(!res.ok || !json || json.code!==200) throw new Error(json?.message||`OpenList HTTP ${res.status}`);
    return json.data;
  } finally { clearTimeout(timer); }
}

async function updateTask(taskIdValue,patch) {
  if(!taskIdValue) return null;
  const old=await readOpenListTask();
  if(old?.id && old.id!==taskIdValue) return old;
  const next={...old,...patch,progress:{...(old?.progress||{}),...(patch?.progress||{})}};
  return writeOpenListTask(next);
}

async function listDirectoryRemote(config,dir,{taskIdValue=null,dirIndex=0,dirsTotal=0}={}) {
  const data=await openListJson(config,'/api/fs/list',{path:dir,password:'',page:1,per_page:0,refresh:false});
  const content=Array.isArray(data?.content)?data.content:[];
  const total=Number(data?.total||content.length||0);
  const files={};
  for(const item of content) {
    if(item?.is_dir) continue;
    const full=path.posix.join(dir==='/'?'/':dir,String(item?.name||''));
    files[full]={name:String(item?.name||''),size:Number(item?.size||0),modified:String(item?.modified||''),created:String(item?.created||''),md5:hashMd5(item)};
  }
  await updateTask(taskIdValue,{stage:'listing',message:`扫描 OpenList 清单 ${dirIndex+1}/${dirsTotal}：${content.length}/${total||content.length}`,progress:{directoriesDone:dirIndex+1,directoriesTotal:dirsTotal,currentDirectory:dir,currentDirectorySeen:content.length,currentDirectoryTotal:total}});
  return {files,total,fetchedAt:nowIso()};
}

async function buildRemoteIndex(config,dirs,{forceListRefresh=false,taskIdValue=null}={}) {
  const scopeKey=cacheScopeKey(config);
  let cache=await readOpenListDirectoryCache();
  if(cache.scopeKey!==scopeKey) cache={version:1,scopeKey,directories:{}};
  const remote=new Map();
  let cacheHits=0,cacheRefreshes=0,dirty=false;
  for(let i=0;i<dirs.length;i+=1) {
    const dir=dirs[i];
    let entry=cache.directories?.[dir];
    if(forceListRefresh || !entry || !cacheFresh(entry.fetchedAt)) {
      entry=await listDirectoryRemote(config,dir,{taskIdValue,dirIndex:i,dirsTotal:dirs.length});
      cache.directories[dir]=entry; cacheRefreshes+=1; dirty=true;
    } else {
      cacheHits+=1;
      await updateTask(taskIdValue,{stage:'listing',message:`使用 ZONOE OpenList 清单缓存 ${i+1}/${dirs.length}`,progress:{directoriesDone:i+1,directoriesTotal:dirs.length,cacheHits,cacheRefreshes}});
    }
    for(const [k,v] of Object.entries(entry.files||{})) remote.set(k,v);
    await updateTask(taskIdValue,{progress:{directoriesDone:i+1,directoriesTotal:dirs.length,cacheHits,cacheRefreshes}});
  }
  if(dirty) await writeOpenListDirectoryCache(cache);
  return {remote,cacheHits,cacheRefreshes,cacheUpdatedAt:dirty?nowIso():null};
}

async function readReferencedIpas(config,{taskIdValue=null}={}) {
  const sources=(await listMysqlSources({withSecrets:true})).filter(x=>x.enabled!==false);
  const refs=[]; const sourceErrors=[]; let ignored=0;
  for(let i=0;i<sources.length;i+=1) {
    const source=sources[i];
    await updateTask(taskIdValue,{stage:'mysql',message:`读取 MySQL 软件源 ${i+1}/${sources.length}：${source.name}`,progress:{sourcesDone:i,sourcesTotal:sources.length,databaseRefs:refs.length}});
    try {
      const table=safeIdentifier(source.config.table||'fa_category');
      const sql=`SELECT id,HEX(name),HEX(nickname),HEX(bt1a),HEX(bt2a) FROM ${table} WHERE status IN ('normal','published','1','active') AND bt1a IS NOT NULL AND bt1a<>''`;
      const rows=parseTsv(await runMysql(source.config,sql,{timeoutMs:25000}));
      for(const [id,nameHex,versionHex,urlHex,sizeHex] of rows) {
        const downloadUrl=fromHex(urlHex).trim();
        const apiPath=publicUrlToApiPath(downloadUrl,config);
        if(!apiPath){ ignored+=1; continue; }
        refs.push({
          appKey:`${source.slug}:${Number(id)}`,sourceSlug:source.slug,sourceName:source.name,legacyId:Number(id),
          name:fromHex(nameHex).trim(),version:fromHex(versionHex).trim(),downloadUrl,dbSize:numericSize(fromHex(sizeHex)),apiPath
        });
      }
    } catch(e) {
      sourceErrors.push({source:source.slug,message:e?.message||'读取 bt1a 失败'});
    }
    await updateTask(taskIdValue,{progress:{sourcesDone:i+1,sourcesTotal:sources.length,databaseRefs:refs.length,ignoredRefs:ignored}});
  }
  return {refs,ignored,sourceErrors};
}

async function parseWithPython(rawUrl,size,timeoutMs=45000) {
  return new Promise((resolve,reject)=>{
    const child=spawn('python3',[PARSER],{stdio:['pipe','pipe','pipe']});
    let out='',err='',done=false;
    const finish=(fn,value)=>{if(done)return;done=true;clearTimeout(timer);fn(value)};
    const timer=setTimeout(()=>{child.kill('SIGKILL');const e=new Error('IPA Range 解析超时');e.rangeBytes=0;e.rangeRequests=0;finish(reject,e)},timeoutMs);
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data',d=>out+=d); child.stderr.on('data',d=>err+=d);
    child.on('error',e=>finish(reject,e));
    child.on('close',code=>{
      if(done)return;
      try {
        const line=String(out||'').trim().split('\n').filter(Boolean).at(-1)||'';
        const data=JSON.parse(line);
        if(code!==0 || data?.ok!==true) {
          const e=new Error(data?.error||err.trim()||`parser exited ${code}`);
          e.rangeBytes=Number(data?.range_bytes||0);e.rangeRequests=Number(data?.range_requests||0);
          return finish(reject,e);
        }
        finish(resolve,{
          parsed:{name:String(data.name||''),version:String(data.version||''),build:String(data.build||''),bundle_id:String(data.bundle_id||''),minimum_ios:String(data.minimum_ios||''),executable:String(data.executable||'')},
          rangeBytes:Number(data?.range_bytes||0),rangeRequests:Number(data?.range_requests||0)
        });
      } catch(e) { finish(reject,new Error(err.trim()||e.message||'IPA parser output invalid')); }
    });
    child.stdin.end(JSON.stringify({url:rawUrl,size:Number(size||0)}));
  });
}

async function parseOne(config,apiPath,file) {
  const detail=await openListJson(config,'/api/fs/get',{path:apiPath,password:''},15000);
  const rawUrl=String(detail?.raw_url||'');
  if(!rawUrl) throw new Error('OpenList 未返回 raw_url');
  const size=Number(detail?.size||file.size||0);
  return parseWithPython(rawUrl,size);
}

export async function testOpenListConnection() {
  const row=await getOpenListConfig({withSecret:true});
  if(!row?.config?.url || !row?.config?.token) throw new Error('请先保存 OpenList URL 和令牌');
  const dir=cleanBasePath(row.config.apiBasePath||'/');
  const data=await openListJson(row.config,'/api/fs/list',{path:dir,password:'',page:1,per_page:1,refresh:false});
  return {connected:true,total:Number(data?.total||0),provider:String(data?.provider||'unknown')};
}

function hasCurrentParse(file={}){
  const md5=normalizeMd5(file.md5);
  return Boolean(file.parsed&&(!md5||normalizeMd5(file.parsedMd5||file.md5)===md5)&&!file.parseError);
}

export async function syncOpenListIpaMetadata({parseLimit=0,forceListRefresh=false,taskIdValue=null}={}) {
  parseLimit=Math.max(0,Math.min(20,Number(parseLimit)||0));
  const row=await getOpenListConfig({withSecret:true});
  if(!row?.config?.url || !row?.config?.token) throw Object.assign(new Error('请先配置 OpenList'),{code:'OPENLIST_CONFIG_REQUIRED'});
  if(row.enabled===false) throw Object.assign(new Error('OpenList 元数据同步已停用'),{code:'OPENLIST_DISABLED'});
  const config=row.config;
  const old=await readOpenListIpaCache();
  let library=await loadAndSeedIpaMetadataLibrary(old),libraryChanged=false;
  await updateTask(taskIdValue,{state:'running',stage:'mysql',message:'正在读取数据库 IPA 引用',startedAt:nowIso(),progress:{}});
  const {refs,ignored,sourceErrors}=await readReferencedIpas(config,{taskIdValue});
  const dirs=[...new Set(refs.map(x=>path.posix.dirname(x.apiPath)||'/'))].sort();
  await updateTask(taskIdValue,{stage:'listing',message:'正在读取 OpenList 文件清单',progress:{databaseRefs:refs.length,ignoredRefs:ignored,directoriesTotal:dirs.length,directoriesDone:0}});
  const {remote,cacheHits,cacheRefreshes}=await buildRemoteIndex(config,dirs,{forceListRefresh,taskIdValue});

  const apps={}; const appRefs={}; const files={}; const expected=[...new Set(refs.map(x=>x.apiPath))];
  let newFiles=0,changedFiles=0,unchangedFiles=0,missingFiles=0,metadataReusedByMd5=0;
  for(const ref of refs) {
    apps[ref.appKey]=ref.apiPath;
    appRefs[ref.appKey]=safeAppRef(ref);
  }
  for(const apiPath of expected) {
    const next=remote.get(apiPath);
    const prev=old.files?.[apiPath];
    if(!next) {
      missingFiles+=1;
      if(prev) files[apiPath]={...prev,missing:true,lastSeenAt:prev.lastSeenAt||null};
      continue;
    }
    const changed=metadataChanged(prev,next);
    if(!prev) newFiles+=1; else if(changed) changedFiles+=1; else unchangedFiles+=1;
    files[apiPath]={...(changed?{}:prev||{}),name:next.name,size:next.size,modified:next.modified,created:next.created,md5:next.md5,missing:false,lastSeenAt:nowIso()};
    if(changed) {
      files[apiPath].parsed=null; files[apiPath].parsedMd5=''; files[apiPath].parseError=''; files[apiPath].parsedAt=null; files[apiPath].nextParseAfter=null;
    }
    if(!hasCurrentParse(files[apiPath])&&files[apiPath].md5){
      const saved=getParsedMetadataByMd5(library,files[apiPath].md5,files[apiPath].size);
      if(saved){
        files[apiPath].parsed={...saved.parsed};files[apiPath].parsedMd5=normalizeMd5(files[apiPath].md5);files[apiPath].parsedAt=saved.parsedAt||nowIso();
        files[apiPath].parseError='';files[apiPath].nextParseAfter=null;files[apiPath].metadataReusedByMd5=true;metadataReusedByMd5+=1;
      }
    }
  }
  const missingEntries=refs.filter(ref=>!remote.has(ref.apiPath)).map(ref=>({
    appKey:ref.appKey,sourceSlug:ref.sourceSlug,sourceName:ref.sourceName,legacyId:ref.legacyId,name:ref.name,version:ref.version,
    downloadUrl:ref.downloadUrl,dbSize:ref.dbSize,apiPath:ref.apiPath,reason:'OpenList 清单中未找到对应文件'
  }));
  await updateTask(taskIdValue,{stage:'compare',message:'MD5 对比完成',progress:{databaseRefs:refs.length,uniqueFiles:expected.length,foundFiles:expected.length-missingFiles,missingFiles,missingRefs:missingEntries.length,newFiles,changedFiles,unchangedFiles,metadataReusedByMd5,cacheHits,cacheRefreshes}});

  const allCandidates=expected.filter(p=>files[p]&&!files[p].missing&&!hasCurrentParse(files[p]));
  const eligible=[];const seenMd5=new Set();
  for(const p of allCandidates){
    if(files[p].nextParseAfter&&Date.parse(files[p].nextParseAfter)>Date.now())continue;
    const md5=normalizeMd5(files[p].md5);
    if(md5&&seenMd5.has(md5))continue;
    if(md5)seenMd5.add(md5);
    eligible.push(p);
  }
  const budgetBefore=await getRangeBudgetStatus();
  const budgetAllowed=Math.min(Number(budgetBefore.hour.remaining||0),Number(budgetBefore.day.remaining||0));
  const selected=eligible.slice(0,Math.min(parseLimit,budgetAllowed));
  const budgetBlocked=Math.max(0,Math.min(parseLimit,eligible.length)-selected.length);
  let parsedNow=0,parseFailedNow=0,rangeBytesNow=0,rangeRequestsNow=0;
  for(let i=0;i<selected.length;i+=1) {
    const apiPath=selected[i];
    await updateTask(taskIdValue,{stage:'parsing',message:`正在 Range 解析 ${i+1}/${selected.length}：${path.posix.basename(apiPath)}`,progress:{parseTarget:selected.length,parseDone:i,parsedSuccess:parsedNow,parsedFailed:parseFailedNow,currentFile:path.posix.basename(apiPath),rangeBytesNow,rangeRequestsNow}});
    try {
      const result=await parseOne(config,apiPath,files[apiPath]);
      const parsed=result.parsed;
      files[apiPath].parsed=parsed; files[apiPath].parsedMd5=files[apiPath].md5||''; files[apiPath].parsedAt=nowIso(); files[apiPath].parseError=''; files[apiPath].nextParseAfter=null;
      files[apiPath].rangeBytes=Number(result.rangeBytes||0);files[apiPath].rangeRequests=Number(result.rangeRequests||0);
      parsedNow+=1;rangeBytesNow+=files[apiPath].rangeBytes;rangeRequestsNow+=files[apiPath].rangeRequests;
      await appendRangeUsage({at:nowIso(),success:true,apiPath,md5:files[apiPath].md5,size:files[apiPath].size,rangeBytes:files[apiPath].rangeBytes,rangeRequests:files[apiPath].rangeRequests});
      const md5=normalizeMd5(files[apiPath].md5);
      if(md5){
        library=rememberParsedMetadata(library,{md5,size:files[apiPath].size,parsed,parsedAt:files[apiPath].parsedAt,source:'range-parser'});libraryChanged=true;
        for(const otherPath of expected){
          if(otherPath===apiPath||normalizeMd5(files[otherPath]?.md5)!==md5||hasCurrentParse(files[otherPath]))continue;
          files[otherPath].parsed={...parsed};files[otherPath].parsedMd5=md5;files[otherPath].parsedAt=files[apiPath].parsedAt;files[otherPath].parseError='';files[otherPath].nextParseAfter=null;files[otherPath].metadataReusedByMd5=true;metadataReusedByMd5+=1;
        }
      }
    } catch(e) {
      const rb=Number(e?.rangeBytes||0),rr=Number(e?.rangeRequests||0);rangeBytesNow+=rb;rangeRequestsNow+=rr;
      files[apiPath].parseError=String(e?.message||'解析失败').slice(0,500); files[apiPath].lastParseAttemptAt=nowIso(); files[apiPath].nextParseAfter=new Date(Date.now()+PARSE_RETRY_DELAY_MS).toISOString(); files[apiPath].rangeBytes=rb;files[apiPath].rangeRequests=rr;parseFailedNow+=1;
      await appendRangeUsage({at:nowIso(),success:false,apiPath,md5:files[apiPath].md5,size:files[apiPath].size,rangeBytes:rb,rangeRequests:rr,error:files[apiPath].parseError});
    }
    await updateTask(taskIdValue,{progress:{parseTarget:selected.length,parseDone:i+1,parsedSuccess:parsedNow,parsedFailed:parseFailedNow,rangeBytesNow,rangeRequestsNow}});
  }
  if(libraryChanged)await writeIpaMetadataLibrary(library);
  const pending=expected.filter(p=>files[p]&&!files[p].missing&&!hasCurrentParse(files[p]));
  const eligiblePending=pending.filter(p=>!files[p].nextParseAfter || Date.parse(files[p].nextParseAfter)<=Date.now());
  const rangeUsage=await getRangeBudgetStatus();
  const lastSync={finishedAt:nowIso(),databaseRefs:refs.length,ignoredRefs:ignored,uniqueFiles:expected.length,foundFiles:expected.length-missingFiles,missingFiles,missingRefs:missingEntries.length,newFiles,changedFiles,unchangedFiles,metadataReusedByMd5,parsedNow,parseFailedNow,pendingParse:pending.length,eligibleParse:eligiblePending.length,budgetBlocked,rangeBytesNow,rangeRequestsNow,cacheHits,cacheRefreshes,directoryCacheMinutes:30,sourceErrors,rangeUsage};
  await updateTask(taskIdValue,{stage:'saving',message:'正在保存 IPA 元数据缓存',progress:{pendingParse:pending.length,eligibleParse:eligiblePending.length,budgetBlocked,rangeBytesNow,rangeRequestsNow}});
  await writeOpenListIpaCache({version:3,files,apps,appRefs,missingEntries,lastSync});
  return lastSync;
}

async function runQueuedTask(spec) {
  try {
    const result=await syncOpenListIpaMetadata({...spec,taskIdValue:spec.id});
    await updateTask(spec.id,{state:'success',stage:'done',message:`完成：本次解析 ${result.parsedNow}，待解析 ${result.pendingParse}`,finishedAt:nowIso(),result,progress:{parseDone:result.parsedNow+result.parseFailedNow,parsedSuccess:result.parsedNow,parsedFailed:result.parseFailedNow,pendingParse:result.pendingParse,budgetBlocked:result.budgetBlocked,rangeBytesNow:result.rangeBytesNow,rangeRequestsNow:result.rangeRequestsNow}});
  } catch(e) {
    await updateTask(spec.id,{state:'failed',stage:'failed',message:String(e?.message||'OpenList 同步失败').slice(0,500),finishedAt:nowIso(),errorCode:e?.code||'OPENLIST_SYNC_FAILED'}).catch(()=>{});
  } finally { taskLocked=false; }
}

export async function queueOpenListIpaMetadata({parseLimit=0,forceListRefresh=false,trigger='manual'}={}) {
  if(taskLocked) throw Object.assign(new Error('已有 OpenList 扫描/解析任务正在运行'),{code:'OPENLIST_TASK_BUSY'});
  const cfg=await getOpenListConfig({withSecret:true});
  if(!cfg?.config?.url || !cfg?.config?.token) throw Object.assign(new Error('请先配置 OpenList'),{code:'OPENLIST_CONFIG_REQUIRED'});
  if(cfg.enabled===false) throw Object.assign(new Error('OpenList 元数据同步已停用'),{code:'OPENLIST_DISABLED'});
  const id=taskId(); taskLocked=true;
  const spec={id,state:'queued',stage:'queued',message:'任务已进入后台队列',trigger,parseLimit:Math.max(0,Math.min(20,Number(parseLimit)||0)),forceListRefresh:!!forceListRefresh,queuedAt:nowIso(),startedAt:null,finishedAt:null,progress:{}};
  try { await writeOpenListTask(spec); } catch(e) { taskLocked=false; throw e; }
  setImmediate(()=>runQueuedTask(spec));
  return spec;
}

export async function listMissingOpenListEntries({page=1,pageSize=100,q=''}={}) {
  page=Math.max(1,Number(page)||1); pageSize=Math.min(200,Math.max(1,Number(pageSize)||100));
  const cache=await readOpenListIpaCache();
  let items=Array.isArray(cache.missingEntries)?cache.missingEntries:[];
  const needle=String(q||'').trim().toLowerCase();
  if(needle) items=items.filter(x=>[x.name,x.version,x.downloadUrl,x.sourceName,x.sourceSlug,x.legacyId,x.apiPath].some(v=>String(v??'').toLowerCase().includes(needle)));
  const total=items.length,offset=(page-1)*pageSize;
  return {items:items.slice(offset,offset+pageSize),total,page,pageSize,uniqueMissingFiles:new Set(items.map(x=>x.apiPath)).size};
}

function resultRefFallback(cache) {
  const refs=Object.values(cache.appRefs||{}).filter(x=>x?.appKey&&x?.apiPath);
  if(refs.length) return {refs,requiresRescan:false};
  const fallback=Object.entries(cache.apps||{}).map(([appKey,apiPath])=>{
    const m=/^([^:]+):(\d+)$/.exec(String(appKey||''));
    return safeAppRef({appKey,apiPath,sourceSlug:m?.[1]||'',legacyId:m?.[2]||0});
  });
  return {refs:fallback,requiresRescan:fallback.length>0};
}

export async function listOpenListParseResults({page=1,pageSize=50,q='',status='all'}={}) {
  page=Math.max(1,Number(page)||1); pageSize=Math.min(100,Math.max(1,Number(pageSize)||50));
  const allowed=new Set(['all','parsed','pending','failed','mismatch']);
  status=allowed.has(String(status||''))?String(status):'all';
  const cache=await readOpenListIpaCache();
  const {refs,requiresRescan}=resultRefFallback(cache);
  let items=refs.map(ref=>{
    const file=cache.files?.[ref.apiPath];
    if(!file||file.missing) return null;
    const meta=file.parsed||{};
    const currentParsed=hasCurrentParse(file);
    const parseStatus=file.parseError?'failed':currentParsed?'parsed':'pending';
    const audit=auditIpaResult(ref,file);
    return {
      appKey:ref.appKey,sourceSlug:ref.sourceSlug,sourceName:ref.sourceName,legacyId:ref.legacyId,
      appName:ref.name,sourceVersion:ref.version,dbSize:ref.dbSize,
      fileName:file.name||path.posix.basename(ref.apiPath||''),apiPath:ref.apiPath,size:Number(file.size||0),
      modified:file.modified||'',verified:Boolean(file.md5),parsedAt:file.parsedAt||null,
      parseStatus,parseError:String(file.parseError||''),rangeBytes:Number(file.rangeBytes||0),rangeRequests:Number(file.rangeRequests||0),
      packageName:String(meta.name||''),packageVersion:String(meta.version||''),packageBuild:String(meta.build||''),
      bundleId:String(meta.bundle_id||''),minimumIos:String(meta.minimum_ios||''),executable:String(meta.executable||''),
      versionMismatch:audit.versionMismatch,sizeMismatch:audit.sizeMismatch,mismatch:audit.mismatch,
      sizeDelta:audit.sizeDelta,sizeTolerance:audit.sizeTolerance
    };
  }).filter(Boolean);
  const counts={
    all:items.length,
    parsed:items.filter(x=>x.parseStatus==='parsed').length,
    pending:items.filter(x=>x.parseStatus==='pending').length,
    failed:items.filter(x=>x.parseStatus==='failed').length,
    mismatch:items.filter(x=>x.mismatch).length
  };
  const needle=String(q||'').trim().toLowerCase();
  if(needle) items=items.filter(x=>[
    x.appKey,x.sourceSlug,x.sourceName,x.legacyId,x.appName,x.sourceVersion,x.fileName,x.apiPath,
    x.packageName,x.packageVersion,x.packageBuild,x.bundleId,x.minimumIos,x.executable,x.parseError
  ].some(v=>String(v??'').toLowerCase().includes(needle)));
  if(status==='mismatch') items=items.filter(x=>x.mismatch);
  else if(status!=='all') items=items.filter(x=>x.parseStatus===status);
  items.sort((a,b)=>String(b.parsedAt||b.modified||'').localeCompare(String(a.parsedAt||a.modified||''))||String(a.appKey).localeCompare(String(b.appKey)));
  const total=items.length,offset=(page-1)*pageSize;
  return {items:items.slice(offset,offset+pageSize),total,page,pageSize,counts,requiresRescan};
}

export async function getOpenListIpaStatus() {
  const [cfg,cache,task,rangeUsage]=await Promise.all([getOpenListConfig(),readOpenListIpaCache(),readOpenListTask(),getRangeBudgetStatus()]);
  const values=Object.values(cache.files||{});
  const parsed=values.filter(x=>x?.parsed).length;
  const failed=values.filter(x=>x?.parseError).length;
  const pending=values.filter(x=>!x?.missing&&!hasCurrentParse(x)).length;
  const sample=values.filter(x=>x?.parsed).sort((a,b)=>String(b.parsedAt||'').localeCompare(String(a.parsedAt||''))).slice(0,10).map(x=>({name:x.parsed?.name||x.name||'',version:x.parsed?.version||'',build:x.parsed?.build||'',bundle_id:x.parsed?.bundle_id||'',minimum_ios:x.parsed?.minimum_ios||'',size:Number(x.size||0),modified:x.modified||'',md5:x.md5||'',parsedAt:x.parsedAt||'',rangeBytes:Number(x.rangeBytes||0),rangeRequests:Number(x.rangeRequests||0)}));
  const schedule=effectiveSchedule(cfg?.schedule||{});
  return {config:cfg,cache:{files:values.length,parsed,pending,failed,lastSync:cache.lastSync||null,sample,missingRefs:Array.isArray(cache.missingEntries)?cache.missingEntries.length:0},task,rangeUsage,scheduler:{...schedule,recommended:RECOMMENDED_OPENLIST_SCHEDULE,nextRunAt:schedule.enabled&&nextScheduledAt?new Date(nextScheduledAt).toISOString():null}};
}

export async function getCachedIpaMetadata(appKey) {
  const cache=await readOpenListIpaCache();
  const apiPath=cache.apps?.[String(appKey||'')];
  const file=apiPath?cache.files?.[apiPath]:null;
  if(!file || file.missing) return null;
  return {size:Number(file.size||0)||null,modified:file.modified||null,parsed_at:file.parsedAt||null,name:file.parsed?.name||'',version:file.parsed?.version||'',build:file.parsed?.build||'',bundle_id:file.parsed?.bundle_id||'',minimum_ios:file.parsed?.minimum_ios||'',verified:Boolean(file.md5)};
}

export function resetOpenListScheduler(){ nextScheduledAt=null; }

async function schedulerTick() {
  try {
    const cfg=await getOpenListConfig();
    const s=effectiveSchedule(cfg?.schedule||{});
    if(!s.enabled){ nextScheduledAt=null; return; }
    const intervalMs=s.intervalMinutes*60*1000;
    if(!nextScheduledAt){ nextScheduledAt=Date.now()+intervalMs; return; }
    if(Date.now()<nextScheduledAt) return;
    nextScheduledAt=Date.now()+intervalMs;
    if(taskLocked) return;
    await queueOpenListIpaMetadata({parseLimit:s.parseLimit,forceListRefresh:false,trigger:'schedule'});
  } catch(e) { console.error('OpenList scheduler:',e?.message||e); }
}

export async function startOpenListScheduler() {
  if(schedulerTimer) return;
  const old=await readOpenListTask();
  if(['queued','running'].includes(old?.state)) await writeOpenListTask({...old,state:'failed',stage:'failed',message:'服务重启，上一轮后台任务已中断，可重新启动',finishedAt:nowIso()});
  await schedulerTick();
  schedulerTimer=setInterval(schedulerTick,30_000); schedulerTimer.unref?.();
}

export { cleanBasePath, cleanPrefix };
