import { createHash } from 'node:crypto';
import path from 'node:path';
import { listMysqlSources,getOpenListConfig,readOpenListIpaCache,readOpenListReplicaConfig,writeOpenListReplicaConfig } from '../storage/controlStore.js';
import { fromHex,parseTsv,runMysql,safeIdentifier } from './mysqlCli.js';
import { publicUrlToApiPath } from './openListMetadataService.js';
import { readReplicaPreview,writeReplicaPreview,clearReplicaPreview } from './replicaPreviewStore.js';
import {
  REPLICA_SNAPSHOT_TTL_MS,clearReplicaSnapshots,invalidateReplicaSnapshots,
  readReplicaSnapshots,snapshotFresh,snapshotKey,writeReplicaSnapshots
} from './replicaSnapshotStore.js';

const MAX_SCAN_FILES=20000;
const MAX_SCAN_DIRS=1000;
const REPLICA_SCHEMA_VERSION=2;

function cleanPath(v='/'){
  let s=String(v||'/').trim().replace(/\\/g,'/');
  if(!s.startsWith('/'))s=`/${s}`;
  s=path.posix.normalize(s);
  if(!s.startsWith('/'))s=`/${s}`;
  while(s.length>1&&s.endsWith('/'))s=s.slice(0,-1);
  return s||'/';
}
function joinPath(...parts){return cleanPath(path.posix.join(...parts));}
function relPath(root,full){
  root=cleanPath(root);full=cleanPath(full);
  if(full===root)return '';
  if(root!=='/'&&!full.startsWith(`${root}/`))return null;
  return (root==='/'?full.slice(1):full.slice(root.length+1)).replace(/^\/+/, '');
}
export function relativeFromApiPath(apiPath,apiBasePath='/'){
  return relPath(cleanPath(apiBasePath),cleanPath(apiPath));
}
function md5Of(item){
  if(item?.hash_info?.md5)return String(item.hash_info.md5).toUpperCase();
  try{return String(JSON.parse(item?.hashinfo||'{}')?.md5||'').toUpperCase()}catch{return ''}
}
function numeric(v){const n=Number(String(v??'').trim());return Number.isFinite(n)&&n>=0?Math.round(n):null}
function err(code,message,details){return Object.assign(new Error(message),{code,details})}
function fingerprint(v){return createHash('sha256').update(String(v||'')).digest('hex').slice(0,16)}
function replicaScopeKey(config){return `${String(config.url||'').replace(/\/+$/,'')}|${fingerprint(config.token)}`}
function previewFresh(p){const t=Date.parse(String(p?.generatedAt||''));return Number.isFinite(t)&&Date.now()-t<REPLICA_SNAPSHOT_TTL_MS}
function previewCompatible(p){return Number(p?.replicaSchemaVersion||0)>=REPLICA_SCHEMA_VERSION}
function makeMetrics(){return {openListRequests:0,fsListRequests:0,storageListRequests:0,fileOperationRequests:0,snapshotHits:0,remoteMountScans:0}}

async function openListRequest(config,apiPath,{method='POST',body,query,timeoutMs=30000,metrics}={}){
  if(metrics){metrics.openListRequests+=1;if(apiPath==='/api/fs/list')metrics.fsListRequests+=1;else if(apiPath==='/api/admin/storage/list')metrics.storageListRequests+=1;else if(apiPath.startsWith('/api/fs/'))metrics.fileOperationRequests+=1}
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const base=String(config.url||'').replace(/\/+$/,'');
    const u=new URL(`${base}${apiPath}`);
    for(const [k,v] of Object.entries(query||{}))if(v!==undefined&&v!==null)u.searchParams.set(k,String(v));
    const options={method,headers:{Authorization:config.token,'User-Agent':'zonoe-openlist-replica/1.2'},signal:controller.signal};
    if(body!==undefined){options.headers['Content-Type']='application/json';options.body=JSON.stringify(body)}
    const res=await fetch(u,options);const json=await res.json().catch(()=>null);
    if(!res.ok||!json||json.code!==200)throw err('OPENLIST_API_FAILED',json?.message||`OpenList HTTP ${res.status}`,{status:res.status,apiPath});
    return json.data;
  }finally{clearTimeout(timer)}
}

export async function listOpenListStorages(config,metrics){
  const data=await openListRequest(config,'/api/admin/storage/list',{method:'GET',query:{page:1,per_page:500},metrics});
  return (Array.isArray(data?.content)?data.content:[]).map(x=>({
    id:Number(x.id),mountPath:cleanPath(x.mount_path||'/'),driver:String(x.driver||''),status:String(x.status||''),disabled:x.disabled===true,remark:String(x.remark||''),modified:x.modified||null,
    _addition:x.addition
  }));
}

async function listIpaTree(config,rootPath,metrics){
  rootPath=cleanPath(rootPath);const queue=[rootPath],files={};let dirs=0,seen=0;
  while(queue.length){
    const dir=queue.shift();dirs+=1;if(dirs>MAX_SCAN_DIRS)throw err('REPLICA_SCAN_LIMIT','目录数量过多，已停止扫描');
    const data=await openListRequest(config,'/api/fs/list',{body:{path:dir,password:'',page:1,per_page:0,refresh:false},metrics});
    const content=Array.isArray(data?.content)?data.content:[];
    for(const item of content){
      const full=joinPath(dir,String(item?.name||''));
      if(item?.is_dir){queue.push(full);continue}
      if(!String(item?.name||'').toLowerCase().endsWith('.ipa'))continue;
      const relative=relPath(rootPath,full);if(relative===null)continue;
      files[relative]={relativePath:relative,name:String(item?.name||''),fullPath:full,size:Number(item?.size||0),modified:String(item?.modified||''),md5:md5Of(item)};
      seen+=1;if(seen>MAX_SCAN_FILES)throw err('REPLICA_SCAN_LIMIT','IPA 数量超过安全扫描上限');
    }
  }
  return files;
}

async function readExpected(config){
  const cache=await readOpenListIpaCache();
  const sources=(await listMysqlSources({withSecrets:true})).filter(x=>x.enabled!==false);
  const byPath=new Map(),sourceErrors=[];let ignored=0;
  for(const source of sources){
    try{
      const table=safeIdentifier(source.config.table||'fa_category');
      const sql=`SELECT id,HEX(name),HEX(nickname),HEX(bt1a),HEX(bt2a) FROM ${table} WHERE status IN ('normal','published','1','active') AND bt1a IS NOT NULL AND bt1a<>''`;
      const rows=parseTsv(await runMysql(source.config,sql,{timeoutMs:25000}));
      for(const [id,nameHex,versionHex,urlHex,sizeHex] of rows){
        const downloadUrl=fromHex(urlHex).trim();const apiPath=publicUrlToApiPath(downloadUrl,config);
        if(!apiPath){ignored+=1;continue}
        const relativePath=relativeFromApiPath(apiPath,config.apiBasePath||'/');
        if(relativePath===null||!relativePath||!relativePath.toLowerCase().endsWith('.ipa')){ignored+=1;continue}
        const app={appKey:`${source.slug}:${Number(id)}`,sourceSlug:source.slug,sourceName:source.name,legacyId:Number(id),name:fromHex(nameHex).trim(),version:fromHex(versionHex).trim(),downloadUrl,dbSize:numeric(fromHex(sizeHex))};
        if(!byPath.has(relativePath)){
          const cached=cache.files?.[apiPath]||{};
          byPath.set(relativePath,{relativePath,apiPath,fileName:path.posix.basename(relativePath),apps:[],md5:String(cached.md5||'').toUpperCase(),size:Number(cached.size||0)});
        }
        byPath.get(relativePath).apps.push(app);
      }
    }catch(e){sourceErrors.push({source:source.slug,message:e?.message||'读取软件源失败'})}
  }
  return {items:[...byPath.values()].sort((a,b)=>a.relativePath.localeCompare(b.relativePath)),ignored,sourceErrors};
}

function sameDir(a,b){return path.posix.dirname(a||'')===path.posix.dirname(b||'')}
export function replicaIntegrityStatus(expected,actual){
  if(!actual)return 'missing';
  const expectedMd5=String(expected?.md5||'').toUpperCase(),actualMd5=String(actual?.md5||'').toUpperCase();
  const expectedSize=Number(expected?.size||0),actualSize=Number(actual?.size||0);
  if(expectedMd5&&actualMd5&&expectedMd5!==actualMd5)return 'md5_mismatch';
  if(expectedSize>0&&actualSize>0&&expectedSize!==actualSize)return 'size_mismatch';
  if(expectedMd5&&actualMd5&&expectedMd5===actualMd5)return 'verified';
  return 'unverified';
}

export function buildReplicaDiff(expectedItems,mountSnapshots){
  const expected=new Map((expectedItems||[]).map(x=>[x.relativePath,x]));
  const rows=[];const perMount=[];
  for(const snap of mountSnapshots||[]){
    const actual=snap.files||{};const missing=[],extra=[],integrityIssues=[];let verified=0,unverified=0,present=0;
    for(const item of expected.values()){
      const found=actual[item.relativePath];const status=replicaIntegrityStatus(item,found);
      if(status==='missing'){missing.push(item);continue}
      present+=1;
      if(status==='verified'){verified+=1;continue}
      if(status==='unverified'){unverified+=1;continue}
      integrityIssues.push({relativePath:item.relativePath,status,apps:item.apps||[],expectedMd5:String(item.md5||''),actualMd5:String(found?.md5||''),expectedSize:Number(item.size||0),actualSize:Number(found?.size||0)});
    }
    for(const item of Object.values(actual))if(!expected.has(item.relativePath))extra.push(item);
    const extraByMd5=new Map();for(const x of extra)if(x.md5){if(!extraByMd5.has(x.md5))extraByMd5.set(x.md5,[]);extraByMd5.get(x.md5).push(x)}
    const renameSuggestions=[];
    for(const x of missing){if(!x.md5)continue;const candidates=extraByMd5.get(x.md5)||[];const same=candidates.filter(c=>sameDir(c.relativePath,x.relativePath));if(same.length===1)renameSuggestions.push({fromRelative:same[0].relativePath,toRelative:x.relativePath,md5:x.md5})}
    perMount.push({storageId:snap.storageId,label:snap.label,mountPath:snap.mountPath,rootPath:snap.rootPath,writable:snap.writable,error:snap.error||null,total:Object.keys(actual).length,expected:expected.size,present,verified,unverified,integrityIssues,missing,extra,renameSuggestions,snapshot:snap.snapshot||null});
  }
  for(const item of expected.values()){
    const copies={},copyStatus={};
    for(const snap of mountSnapshots||[]){const found=snap.files?.[item.relativePath];copies[snap.storageId]=Boolean(found);copyStatus[snap.storageId]=replicaIntegrityStatus(item,found)}
    rows.push({...item,copies,copyStatus});
  }
  return {expectedCount:expected.size,mounts:perMount,rows};
}

function validateRoot(mountPath,rootPath){
  mountPath=cleanPath(mountPath);rootPath=cleanPath(rootPath);
  return rootPath===mountPath||rootPath.startsWith(`${mountPath}/`);
}
function publicStorage(s){return {id:s.id,mountPath:s.mountPath,driver:s.driver,status:s.status,disabled:s.disabled,remark:s.remark,modified:s.modified}}
function stringsIn(value,out=[]){if(typeof value==='string')out.push(value);else if(Array.isArray(value))for(const x of value)stringsIn(x,out);else if(value&&typeof value==='object')for(const x of Object.values(value))stringsIn(x,out);return out}
function aliasStatus(storages,config){
  const required=(config.mounts||[]).filter(x=>x.enabled!==false).map(x=>cleanPath(x.rootPath));
  const aliases=storages.filter(x=>String(x.driver).toLowerCase()==='alias').map(x=>{
    let addition={};try{addition=typeof x._addition==='string'?JSON.parse(x._addition):x._addition||{}}catch{}
    const values=stringsIn(addition).map(String);
    const matched=required.filter(root=>values.some(v=>v.includes(root)));
    const policyHints={};
    for(const [k,v] of Object.entries(addition||{}))if(/read|conflict|load|balance/i.test(k))policyHints[k]=v;
    return {id:x.id,mountPath:x.mountPath,status:x.status,disabled:x.disabled,matchedRoots:matched,matchedCount:matched.length,requiredCount:required.length,policyHints};
  });
  const preferred=aliases.find(x=>config.aliasMountPath&&x.mountPath===cleanPath(config.aliasMountPath))||aliases.sort((a,b)=>b.matchedCount-a.matchedCount)[0]||null;
  return {configuredMountPath:config.aliasMountPath||'',requiredRoots:required,candidates:aliases,preferred,covered:Boolean(preferred&&required.length&&preferred.matchedCount===required.length)};
}

async function context(){
  const row=await getOpenListConfig({withSecret:true});if(!row?.config?.url||!row?.config?.token)throw err('OPENLIST_CONFIG_REQUIRED','请先配置 OpenList URL 和令牌');
  return {row,config:row.config,replica:await readOpenListReplicaConfig()};
}

export async function getReplicaManagerState(){
  const {config,replica}=await context();let storages=[],storageError=null;const metrics=makeMetrics();
  try{storages=await listOpenListStorages(config,metrics)}catch(e){storageError=e?.message||'无法读取 OpenList 存储列表'}
  const savedPreview=await readReplicaPreview();
  return {config:replica,openListUrl:String(config.url||''),storages:storages.map(publicStorage),storageError,alias:storages.length?aliasStatus(storages,replica):null,lastPreview:previewCompatible(savedPreview)?savedPreview:null,apiStats:metrics,snapshotTtlMinutes:30};
}

export async function saveReplicaManagerConfig(input){
  const {config}=await context();const metrics=makeMetrics();const storages=await listOpenListStorages(config,metrics);const byId=new Map(storages.map(x=>[x.id,x]));
  const mounts=(Array.isArray(input?.mounts)?input.mounts:[]).map(x=>{
    const storage=byId.get(Number(x.storageId));if(!storage)throw err('REPLICA_CONFIG_INVALID',`OpenList 存储 ${x.storageId} 不存在`);
    if(String(storage.driver).toLowerCase()==='alias')throw err('REPLICA_CONFIG_INVALID',`Alias ${storage.mountPath} 只能用于分流检查，不能作为实体副本盘`);
    const rootPath=cleanPath(x.rootPath||storage.mountPath);if(!validateRoot(storage.mountPath,rootPath))throw err('REPLICA_CONFIG_INVALID',`副本目录 ${rootPath} 必须位于挂载 ${storage.mountPath} 内`);
    return {storageId:storage.id,mountPath:storage.mountPath,rootPath,enabled:x.enabled!==false,writable:x.writable===true,label:String(x.label||storage.remark||storage.mountPath)};
  });
  const ids=mounts.map(x=>x.storageId);if(new Set(ids).size!==ids.length)throw err('REPLICA_CONFIG_INVALID','同一个 OpenList 存储不能重复选择');
  const saved=await writeOpenListReplicaConfig({...input,mounts});
  await clearReplicaPreview();await clearReplicaSnapshots(replicaScopeKey(config));
  return saved;
}

export async function previewReplicas({forceRefresh=false,storageIds=[]}={}){
  const {config,replica}=await context();if(!replica.enabled)throw err('REPLICA_DISABLED','云盘副本管理尚未启用');
  const metrics=makeMetrics();const storages=await listOpenListStorages(config,metrics),byId=new Map(storages.map(x=>[x.id,x]));
  const expected=await readExpected(config);const snapshots=[];const scopeKey=replicaScopeKey(config);const cache=await readReplicaSnapshots(scopeKey);const forceIds=new Set((storageIds||[]).map(Number));let dirty=false;
  for(const mount of replica.mounts.filter(x=>x.enabled!==false)){
    const storage=byId.get(mount.storageId);if(!storage){snapshots.push({...mount,files:{},error:'OpenList 中已找不到此存储'});continue}
    if(storage.disabled){snapshots.push({...mount,label:mount.label||storage.remark||storage.mountPath,files:{},error:'此 OpenList 存储当前已禁用'});continue}
    const key=snapshotKey(mount.storageId,mount.rootPath);const entry=cache.mounts?.[key];const shouldForce=forceRefresh&&(forceIds.size===0||forceIds.has(Number(mount.storageId)));
    if(!shouldForce&&snapshotFresh(entry)){
      metrics.snapshotHits+=1;
      snapshots.push({...mount,label:mount.label||storage.remark||storage.mountPath,files:entry.files||{},snapshot:{cacheHit:true,scannedAt:entry.scannedAt,ageMs:Math.max(0,Date.now()-Date.parse(entry.scannedAt))}});
      continue;
    }
    try{
      const files=await listIpaTree(config,mount.rootPath,metrics);metrics.remoteMountScans+=1;const scannedAt=new Date().toISOString();
      cache.mounts[key]={storageId:mount.storageId,rootPath:mount.rootPath,files,scannedAt};dirty=true;
      snapshots.push({...mount,label:mount.label||storage.remark||storage.mountPath,files,snapshot:{cacheHit:false,scannedAt,ageMs:0}});
    }
    catch(e){snapshots.push({...mount,label:mount.label||storage.remark||storage.mountPath,files:{},error:e?.message||'扫描失败',snapshot:{cacheHit:false,scannedAt:null,ageMs:null}})}
  }
  if(dirty)await writeReplicaSnapshots(cache);
  const diff=buildReplicaDiff(expected.items,snapshots);
  const result={...diff,replicaSchemaVersion:REPLICA_SCHEMA_VERSION,generatedAt:new Date().toISOString(),ignoredDatabaseRefs:expected.ignored,sourceErrors:expected.sourceErrors,alias:aliasStatus(storages,replica),permissions:{allowCopy:replica.allowCopy,allowRename:replica.allowRename,allowQuarantine:replica.allowQuarantine},apiStats:metrics,snapshotTtlMinutes:30};
  await writeReplicaPreview(result);
  return result;
}

async function ensureDir(config,dir,seenDirs=new Set(),metrics){
  dir=cleanPath(dir);if(dir==='/'||seenDirs.has(dir))return;
  const parts=dir.split('/').filter(Boolean);let current='';
  for(const part of parts){
    current+=`/${part}`;if(seenDirs.has(current))continue;
    try{await openListRequest(config,'/api/fs/mkdir',{body:{path:current},metrics})}catch(e){if(!/exist|已存在|already/i.test(String(e.message||'')))throw e}
    seenDirs.add(current);
  }
}
function fullFromRelative(root,relative){return joinPath(root,String(relative||'').replace(/^\/+/,''))}
async function currentPreview(){const p=await readReplicaPreview();return p&&previewCompatible(p)&&previewFresh(p)?p:previewReplicas({forceRefresh:false})}
function rowStatus(row,id){return String(row?.copyStatus?.[id]||(row?.copies?.[id]?'unverified':'missing'))}
function sourceStatusRank(status){return status==='verified'?0:status==='unverified'?1:9}

export function buildReplicaSyncPlan(preview,replica,{limit=20,targetStorageIds=[]}={}){
  const cap=Math.min(50,Math.max(1,Number(limit)||20));
  const targetSet=new Set((targetStorageIds||[]).map(Number));
  const mounts=(replica?.mounts||[]).filter(x=>x.enabled!==false);
  const mountState=new Map((preview?.mounts||[]).map(x=>[Number(x.storageId),x]));
  const priority=new Map(mounts.map((x,i)=>[Number(x.storageId),i]));
  const actions=[];let skippedNoSource=0,blockedIntegrity=0,skippedRename=0;
  for(const row of preview?.rows||[]){
    const candidates=mounts.map(m=>({mount:m,status:rowStatus(row,m.storageId),state:mountState.get(Number(m.storageId))}))
      .filter(x=>!x.state?.error&&sourceStatusRank(x.status)<9)
      .sort((a,b)=>sourceStatusRank(a.status)-sourceStatusRank(b.status)||(priority.get(Number(a.mount.storageId))??9999)-(priority.get(Number(b.mount.storageId))??9999));
    const source=candidates[0]||null;
    let rowNeedsSource=false;
    for(const target of mounts){
      const id=Number(target.storageId),state=mountState.get(id),status=rowStatus(row,id);
      if(targetSet.size&&!targetSet.has(id))continue;
      if(!target.writable||state?.error)continue;
      if(['md5_mismatch','size_mismatch'].includes(status)){blockedIntegrity+=1;continue}
      if(status!=='missing')continue;
      if(state?.renameSuggestions?.some(x=>x.toRelative===row.relativePath)){skippedRename+=1;continue}
      if(!source){rowNeedsSource=true;continue}
      actions.push({relativePath:row.relativePath,sourceStorageId:Number(source.mount.storageId),sourceLabel:source.mount.label||source.mount.mountPath,sourceStatus:source.status,targetStorageId:id,targetLabel:target.label||target.mountPath});
      if(actions.length>=cap)break;
    }
    if(rowNeedsSource)skippedNoSource+=1;
    if(actions.length>=cap)break;
  }
  const hashBody=actions.map(x=>[x.relativePath,x.sourceStorageId,x.sourceStatus,x.targetStorageId]);
  const planHash=createHash('sha256').update(JSON.stringify(hashBody)).digest('hex');
  return {
    generatedAt:new Date().toISOString(),previewGeneratedAt:preview?.generatedAt||null,limit:cap,targetStorageIds:[...targetSet],
    sourcePriority:mounts.map((x,i)=>({rank:i+1,storageId:Number(x.storageId),label:x.label||x.mountPath})),
    actions,planHash,summary:{actions:actions.length,verifiedSourceActions:actions.filter(x=>x.sourceStatus==='verified').length,unverifiedSourceActions:actions.filter(x=>x.sourceStatus==='unverified').length,blockedIntegrity,skippedRename,skippedNoSource}
  };
}

export async function previewReplicaSyncPlan({limit=20,targetStorageIds=[]}={}){
  const {replica}=await context();if(!replica.enabled)throw err('REPLICA_DISABLED','云盘副本管理尚未启用');if(!replica.allowCopy)throw err('REPLICA_COPY_DISABLED','请先开启“允许副本复制”');
  return buildReplicaSyncPlan(await currentPreview(),replica,{limit,targetStorageIds});
}

export async function syncMissingReplicas({limit=20,targetStorageIds=[],planHash=''}={}){
  const {config,replica}=await context();if(!replica.enabled)throw err('REPLICA_DISABLED','云盘副本管理尚未启用');if(!replica.allowCopy)throw err('REPLICA_COPY_DISABLED','请先开启“允许副本复制”');
  const preview=await currentPreview();const plan=buildReplicaSyncPlan(preview,replica,{limit,targetStorageIds});
  if(planHash&&String(planHash)!==plan.planHash)throw err('REPLICA_PLAN_CHANGED','副本状态或来源优先级已变化，请重新预览补齐计划',{expected:plan.planHash,received:String(planHash)});
  const mountCfg=new Map((replica.mounts||[]).map(x=>[Number(x.storageId),x]));
  const queued=[],failed=[],touched=new Set(),seenDirs=new Set(),metrics=makeMetrics();
  for(const a of plan.actions){
    const source=mountCfg.get(Number(a.sourceStorageId)),target=mountCfg.get(Number(a.targetStorageId));if(!source||!target)continue;
    try{
      const src=fullFromRelative(source.rootPath,a.relativePath),dst=fullFromRelative(target.rootPath,a.relativePath);const srcDir=path.posix.dirname(src),dstDir=path.posix.dirname(dst),name=path.posix.basename(src);
      await ensureDir(config,dstDir,seenDirs,metrics);await openListRequest(config,'/api/fs/copy',{body:{src_dir:srcDir,dst_dir:dstDir,names:[name]},metrics});
      queued.push({relativePath:a.relativePath,sourceStorageId:source.storageId,targetStorageId:target.storageId,sourceStatus:a.sourceStatus});touched.add(Number(target.storageId));
    }catch(e){failed.push({relativePath:a.relativePath,sourceStorageId:a.sourceStorageId,targetStorageId:a.targetStorageId,message:e?.message||'复制失败'})}
  }
  if(touched.size)await invalidateReplicaSnapshots(replicaScopeKey(config),[...touched]);
  return {queued,failed,submitted:plan.actions.length,executedPlanHash:plan.planHash,targetSnapshotsInvalidated:[...touched],apiStats:metrics,note:'OpenList 跨存储复制可能进入后台任务队列；目标盘快照已失效，稍后只刷新目标盘即可确认，不需要全盘重扫。'};
}

export async function renameReplicaSuggestion({storageId,fromRelative,toRelative}){
  const {config,replica}=await context();if(!replica.allowRename)throw err('REPLICA_RENAME_DISABLED','请先开启“允许名称修复”');
  const preview=await currentPreview();const mount=preview.mounts.find(x=>Number(x.storageId)===Number(storageId));
  const valid=mount?.renameSuggestions?.some(x=>x.fromRelative===fromRelative&&x.toRelative===toRelative);if(!valid)throw err('REPLICA_RENAME_NOT_SUGGESTED','当前对账结果不再支持这条重命名建议，请重新预览');
  const cfg=replica.mounts.find(x=>Number(x.storageId)===Number(storageId));if(!cfg?.writable)throw err('REPLICA_TARGET_READONLY','目标网盘未标记为可写');
  const metrics=makeMetrics();const source=fullFromRelative(cfg.rootPath,fromRelative);await openListRequest(config,'/api/fs/rename',{body:{path:source,name:path.posix.basename(toRelative)},metrics});
  await invalidateReplicaSnapshots(replicaScopeKey(config),[Number(storageId)]);
  const refreshed=await previewReplicas({forceRefresh:true,storageIds:[Number(storageId)]});
  return {renamed:true,storageId:Number(storageId),fromRelative,toRelative,preview:refreshed,apiStats:metrics};
}

export async function quarantineReplicaExtras({items=[]}={}){
  const {config,replica}=await context();if(!replica.allowQuarantine)throw err('REPLICA_QUARANTINE_DISABLED','请先开启“允许移动到隔离区”');
  const preview=await currentPreview();const selected=(items||[]).slice(0,50),moved=[],failed=[];const today=new Date().toISOString().slice(0,10);const touched=new Set(),seenDirs=new Set(),metrics=makeMetrics();
  for(const item of selected){
    const mount=preview.mounts.find(x=>Number(x.storageId)===Number(item.storageId));const cfg=replica.mounts.find(x=>Number(x.storageId)===Number(item.storageId));
    if(!mount||mount.error||!cfg?.writable||!mount.extra.some(x=>x.relativePath===item.relativePath)){failed.push({...item,message:'不是当前可隔离的多余 IPA，或目标网盘不可写'});continue}
    try{
      const src=fullFromRelative(cfg.rootPath,item.relativePath),srcDir=path.posix.dirname(src),name=path.posix.basename(src);const relativeDir=path.posix.dirname(item.relativePath)==='.'?'':path.posix.dirname(item.relativePath);
      const dstDir=joinPath(cfg.rootPath,replica.quarantineFolder,today,relativeDir);await ensureDir(config,dstDir,seenDirs,metrics);await openListRequest(config,'/api/fs/move',{body:{src_dir:srcDir,dst_dir:dstDir,names:[name]},metrics});moved.push(item);touched.add(Number(item.storageId));
    }catch(e){failed.push({...item,message:e?.message||'隔离失败'})}
  }
  let refreshed=null;if(touched.size){await invalidateReplicaSnapshots(replicaScopeKey(config),[...touched]);refreshed=await previewReplicas({forceRefresh:true,storageIds:[...touched]})}
  return {moved,failed,quarantineFolder:replica.quarantineFolder,permanentDelete:false,preview:refreshed,apiStats:metrics};
}
