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
import {
  appendReplicaAudit,applyReplicaOperationUpdates,createReplicaCopyBatch,getPendingReplicaCopyOperations,
  getReplicaBatchesNeedingRefresh,getReplicaOperationState,markReplicaBatchRefresh
} from './replicaOperationStore.js';

const MAX_SCAN_FILES=20000;
const MAX_SCAN_DIRS=1000;
const REPLICA_SCHEMA_VERSION=2;
export const COPY_VERIFY_TIMEOUT_MS=10*60*1000;
export const COPY_MISMATCH_CONFIRM_MS=30*1000;
const COPY_VERIFY_INTERVAL_MS=15*1000;
const COPY_VERIFY_BATCH=100;
let replicaVerifierTimer=null;
let replicaVerifierBusy=false;

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
function operationKey(x){return `${String(x?.relativePath||'')}|${Number(x?.targetStorageId||0)}`}
function terminalOperationStatus(status){return ['success','failed','timeout'].includes(String(status||''))}

async function openListRequest(config,apiPath,{method='POST',body,query,timeoutMs=30000,metrics}={}){
  if(metrics){metrics.openListRequests+=1;if(apiPath==='/api/fs/list')metrics.fsListRequests+=1;else if(apiPath==='/api/admin/storage/list')metrics.storageListRequests+=1;else if(apiPath.startsWith('/api/fs/'))metrics.fileOperationRequests+=1}
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const base=String(config.url||'').replace(/\/+$/,'');
    const u=new URL(`${base}${apiPath}`);
    for(const [k,v] of Object.entries(query||{}))if(v!==undefined&&v!==null)u.searchParams.set(k,String(v));
    const options={method,headers:{Authorization:config.token,'User-Agent':'zonoe-openlist-replica/1.3'},signal:controller.signal};
    if(body!==undefined){options.headers['Content-Type']='application/json';options.body=JSON.stringify(body)}
    const res=await fetch(u,options);const json=await res.json().catch(()=>null);
    if(!res.ok||!json||json.code!==200)throw err('OPENLIST_API_FAILED',json?.message||`OpenList HTTP ${res.status}`,{status:res.status,apiPath,openListCode:json?.code});
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
      actions.push({
        relativePath:row.relativePath,sourceStorageId:Number(source.mount.storageId),sourceLabel:source.mount.label||source.mount.mountPath,sourceStatus:source.status,
        targetStorageId:id,targetLabel:target.label||target.mountPath,sourceRootPath:String(source.mount.rootPath||''),targetRootPath:String(target.rootPath||''),expectedMd5:String(row.md5||'').toUpperCase(),expectedSize:Number(row.size||0)
      });
      if(actions.length>=cap)break;
    }
    if(rowNeedsSource)skippedNoSource+=1;
    if(actions.length>=cap)break;
  }
  const hashBody=actions.map(x=>[x.relativePath,x.sourceStorageId,x.sourceStatus,x.sourceRootPath,x.targetStorageId,x.targetRootPath,x.expectedMd5,x.expectedSize]);
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

export function evaluateReplicaCopyVerification(operation,actual,now=Date.now()){
  const started=Date.parse(String(operation?.submittedAt||operation?.createdAt||''));
  const elapsed=Number.isFinite(started)?Math.max(0,now-started):0;
  const expired=elapsed>=COPY_VERIFY_TIMEOUT_MS;
  const expectedMd5=String(operation?.expectedMd5||'').toUpperCase();
  const expectedSize=Number(operation?.expectedSize||0);
  if(!actual){
    if(expired)return {status:'timeout',verification:'not_found',message:'复制验证超时：目标文件仍未出现'};
    return {status:'waiting',verification:'waiting',message:'等待 OpenList/网盘完成复制'};
  }
  const actualMd5=String(actual?.md5||'').toUpperCase();
  const actualSize=Number(actual?.size||0);
  if(expectedMd5&&actualMd5&&expectedMd5!==actualMd5){
    if(elapsed<COPY_MISMATCH_CONFIRM_MS)return {status:'verifying',verification:'md5_mismatch_pending',message:'目标文件已出现，但 MD5 暂不一致；等待最终一致性'};
    return {status:'failed',verification:'md5_mismatch',message:'复制后 MD5 与期望不一致'};
  }
  if(expectedSize>0&&actualSize>0&&expectedSize!==actualSize){
    if(elapsed<COPY_MISMATCH_CONFIRM_MS)return {status:'verifying',verification:'size_mismatch_pending',message:'目标文件已出现，但大小暂不一致；等待最终一致性'};
    return {status:'failed',verification:'size_mismatch',message:'复制后文件大小与期望不一致'};
  }
  if(expectedMd5&&actualMd5&&expectedMd5===actualMd5)return {status:'success',verification:'md5',message:'复制完成，MD5 一致'};
  if(expectedSize>0&&actualSize===expectedSize)return {status:'success',verification:expectedMd5?'size_only_no_hash':'size',message:expectedMd5?'复制完成；目标驱动未返回 MD5，文件大小一致':'复制完成，文件大小一致'};
  if(actualSize>0||actualMd5)return {status:'success',verification:'presence_only',message:'复制完成；缺少可比较的期望 Hash/大小'};
  if(expired)return {status:'timeout',verification:'incomplete_metadata',message:'目标条目已出现，但验证信息持续不完整'};
  return {status:'verifying',verification:'incomplete_metadata',message:'目标条目已出现，等待验证信息'};
}

function permanentVerificationError(e){
  const status=Number(e?.details?.status||0);const msg=String(e?.message||'');
  return status===401||status===403||/unauthor|forbidden|permission|权限|令牌|token/i.test(msg);
}
async function inspectReplicaCopyTarget(config,target,operation,metrics,directoryCache){
  const rootPath=String(operation.targetRootPath||target?.rootPath||'');if(!rootPath)throw err('REPLICA_TARGET_CONFIG_MISSING','找不到复制任务提交时的目标副本目录');
  const full=fullFromRelative(rootPath,operation.relativePath);
  const detail=await openListRequest(config,'/api/fs/get',{body:{path:full,password:''},timeoutMs:15000,metrics});
  const actual={size:Number(detail?.size||0),md5:md5Of(detail)};
  if(operation.expectedMd5&&!actual.md5){
    const dir=path.posix.dirname(full),name=path.posix.basename(full),key=`${Number(operation.targetStorageId)}|${dir}`;
    let content=directoryCache.get(key);
    if(!content){
      const listed=await openListRequest(config,'/api/fs/list',{body:{path:dir,password:'',page:1,per_page:0,refresh:false},timeoutMs:20000,metrics});
      content=Array.isArray(listed?.content)?listed.content:[];directoryCache.set(key,content);
    }
    const item=content.find(x=>String(x?.name||'')===name);
    if(item){actual.size=Number(item?.size||actual.size||0);actual.md5=md5Of(item)}
  }
  return actual;
}

export async function getReplicaOperations({limit=100}={}){return getReplicaOperationState({limit})}

export async function verifyReplicaOperationsNow({limit=COPY_VERIFY_BATCH}={}){
  if(replicaVerifierBusy)return {busy:true,state:await getReplicaOperationState({limit:100})};
  replicaVerifierBusy=true;
  const metrics=makeMetrics();let checked=0,terminal=0;
  try{
    const pending=await getPendingReplicaCopyOperations(Math.min(COPY_VERIFY_BATCH,Math.max(1,Number(limit)||COPY_VERIFY_BATCH)));
    const refreshBefore=await getReplicaBatchesNeedingRefresh(20);
    if(!pending.length&&!refreshBefore.length)return {busy:false,checked:0,terminal:0,apiStats:metrics,state:await getReplicaOperationState({limit:100})};
    let ctx=null;
    try{ctx=await context()}catch(e){return {busy:false,checked:0,terminal:0,error:e?.message||'副本配置不可用',apiStats:metrics,state:await getReplicaOperationState({limit:100})}}
    const {config,replica}=ctx;const currentScope=replicaScopeKey(config);const targets=new Map((replica.mounts||[]).map(x=>[Number(x.storageId),x]));const directoryCache=new Map();const updates=[],audits=[];
    for(const operation of pending){
      checked+=1;const now=Date.now();const target=targets.get(Number(operation.targetStorageId));let result,actual=null,verifyError='';
      if(operation.scopeKey&&operation.scopeKey!==currentScope){
        result={status:'failed',verification:'scope_changed',message:'OpenList 配置/令牌已变化，停止验证旧账号复制任务'};
      }else if(!operation.targetRootPath&&!target){
        result={status:'failed',verification:'target_config_missing',message:'找不到复制任务提交时的目标副本目录'};
      }else{
        try{actual=await inspectReplicaCopyTarget(config,target,operation,metrics,directoryCache);result=evaluateReplicaCopyVerification(operation,actual,now)}
        catch(e){
          verifyError=String(e?.message||'验证目标文件失败');
          if(permanentVerificationError(e))result={status:'failed',verification:'api_permission_error',message:`验证失败：${verifyError}`};
          else result=evaluateReplicaCopyVerification(operation,null,now);
        }
      }
      const done=terminalOperationStatus(result.status);if(done)terminal+=1;
      const patch={
        id:operation.id,status:result.status,verification:result.verification,message:result.message,error:done&&result.status!=='success'?(verifyError||result.message):verifyError,
        attempts:Number(operation.attempts||0)+1,lastCheckedAt:new Date(now).toISOString(),actualMd5:String(actual?.md5||operation.actualMd5||''),actualSize:Number(actual?.size||operation.actualSize||0),completedAt:done?new Date(now).toISOString():null
      };
      updates.push(patch);
      if(done)audits.push({
        type:'copy_verify',status:result.status,batchId:operation.batchId,relativePath:operation.relativePath,sourceStorageId:operation.sourceStorageId,targetStorageId:operation.targetStorageId,
        verification:result.verification,message:result.message
      });
    }
    if(updates.length)await applyReplicaOperationUpdates(updates,audits);

    const needRefresh=await getReplicaBatchesNeedingRefresh(20);
    if(needRefresh.length){
      const stale=needRefresh.filter(x=>x.scopeKey&&x.scopeKey!==currentScope);
      const current=needRefresh.filter(x=>!x.scopeKey||x.scopeKey===currentScope);
      const skippedAt=new Date().toISOString();
      for(const batch of stale)await markReplicaBatchRefresh(batch.id,{refreshedAt:skippedAt,refreshError:'OpenList 配置已变化，未刷新旧账号目标盘'},{type:'copy_target_refresh',status:'skipped',message:'OpenList 配置已变化，跳过旧账号目标盘刷新'});
      if(current.length){
        const storageIds=[...new Set(current.flatMap(x=>x.targetStorageIds||[]).map(Number).filter(Number.isFinite))];
        try{
          if(storageIds.length){await invalidateReplicaSnapshots(currentScope,storageIds);await previewReplicas({forceRefresh:true,storageIds})}
          const at=new Date().toISOString();
          for(const batch of current)await markReplicaBatchRefresh(batch.id,{refreshedAt:at,refreshError:''},{type:'copy_target_refresh',status:'success',message:`复制批次结束后已自动刷新 ${batch.targetStorageIds?.length||0} 个目标盘`});
        }catch(e){
          for(const batch of current)await markReplicaBatchRefresh(batch.id,{refreshError:e?.message||'目标盘刷新失败'},{type:'copy_target_refresh',status:'failed',message:e?.message||'目标盘刷新失败'});
        }
      }
    }
    return {busy:false,checked,terminal,apiStats:metrics,state:await getReplicaOperationState({limit:100})};
  }finally{replicaVerifierBusy=false}
}

function kickReplicaVerifier(delayMs=1000){
  const timer=setTimeout(()=>verifyReplicaOperationsNow().catch(e=>console.warn('replica copy verifier failed',e?.message||e)),Math.max(0,Number(delayMs)||0));
  timer.unref?.();
}
export function startReplicaOperationVerifier(){
  if(replicaVerifierTimer)return;
  kickReplicaVerifier(1500);
  replicaVerifierTimer=setInterval(()=>verifyReplicaOperationsNow().catch(e=>console.warn('replica copy verifier failed',e?.message||e)),COPY_VERIFY_INTERVAL_MS);
  replicaVerifierTimer.unref?.();
}
export function stopReplicaOperationVerifier(){if(replicaVerifierTimer){clearInterval(replicaVerifierTimer);replicaVerifierTimer=null}}

export async function syncMissingReplicas({limit=20,targetStorageIds=[],planHash=''}={}){
  const {config,replica}=await context();if(!replica.enabled)throw err('REPLICA_DISABLED','云盘副本管理尚未启用');if(!replica.allowCopy)throw err('REPLICA_COPY_DISABLED','请先开启“允许副本复制”');
  const preview=await currentPreview();const plan=buildReplicaSyncPlan(preview,replica,{limit,targetStorageIds});
  if(planHash&&String(planHash)!==plan.planHash)throw err('REPLICA_PLAN_CHANGED','副本状态、期望文件或来源优先级已变化，请重新预览补齐计划',{expected:plan.planHash,received:String(planHash)});
  const mountCfg=new Map((replica.mounts||[]).map(x=>[Number(x.storageId),x]));
  const queued=[],failed=[],touched=new Set(),seenDirs=new Set(),metrics=makeMetrics();
  for(const a of plan.actions){
    const source=mountCfg.get(Number(a.sourceStorageId)),target=mountCfg.get(Number(a.targetStorageId));
    if(!source||!target){failed.push({...a,message:'副本配置已变化，找不到来源盘或目标盘'});continue}
    try{
      const src=fullFromRelative(source.rootPath,a.relativePath),dst=fullFromRelative(target.rootPath,a.relativePath);const srcDir=path.posix.dirname(src),dstDir=path.posix.dirname(dst),name=path.posix.basename(src);
      await ensureDir(config,dstDir,seenDirs,metrics);await openListRequest(config,'/api/fs/copy',{body:{src_dir:srcDir,dst_dir:dstDir,names:[name]},metrics});
      queued.push({relativePath:a.relativePath,sourceStorageId:source.storageId,targetStorageId:target.storageId,sourceStatus:a.sourceStatus});touched.add(Number(target.storageId));
    }catch(e){failed.push({...a,message:e?.message||'复制失败'})}
  }
  if(touched.size)await invalidateReplicaSnapshots(replicaScopeKey(config),[...touched]);
  const failedByKey=new Map(failed.map(x=>[operationKey(x),x]));const queuedKeys=new Set(queued.map(operationKey));
  const tracking=await createReplicaCopyBatch({
    scopeKey:replicaScopeKey(config),planHash:plan.planHash,previewGeneratedAt:plan.previewGeneratedAt,
    actions:plan.actions.map(a=>{
      const failure=failedByKey.get(operationKey(a));
      return {...a,status:queuedKeys.has(operationKey(a))?'submitted':'failed',error:failure?.message||'',message:failure?.message||'OpenList 已接受复制请求，等待目标文件验证'};
    })
  });
  if(queued.length)kickReplicaVerifier(1500);
  return {
    queued,failed,submitted:plan.actions.length,executedPlanHash:plan.planHash,trackingBatchId:tracking?.batch?.id||'',trackingBatch:tracking?.batch||null,
    targetSnapshotsInvalidated:[...touched],apiStats:metrics,
    note:'OpenList 接受复制后，ZONOE 会持久跟踪任务并自动核验目标文件；有 MD5 时优先确认 MD5，一批任务结束后只刷新相关目标盘。'
  };
}

export async function renameReplicaSuggestion({storageId,fromRelative,toRelative}){
  const {config,replica}=await context();if(!replica.allowRename)throw err('REPLICA_RENAME_DISABLED','请先开启“允许名称修复”');
  const preview=await currentPreview();const mount=preview.mounts.find(x=>Number(x.storageId)===Number(storageId));
  const valid=mount?.renameSuggestions?.some(x=>x.fromRelative===fromRelative&&x.toRelative===toRelative);if(!valid)throw err('REPLICA_RENAME_NOT_SUGGESTED','当前对账结果不再支持这条重命名建议，请重新预览');
  const cfg=replica.mounts.find(x=>Number(x.storageId)===Number(storageId));if(!cfg?.writable)throw err('REPLICA_TARGET_READONLY','目标网盘未标记为可写');
  const metrics=makeMetrics();
  try{
    const source=fullFromRelative(cfg.rootPath,fromRelative);await openListRequest(config,'/api/fs/rename',{body:{path:source,name:path.posix.basename(toRelative)},metrics});
    await invalidateReplicaSnapshots(replicaScopeKey(config),[Number(storageId)]);
    const refreshed=await previewReplicas({forceRefresh:true,storageIds:[Number(storageId)]});
    await appendReplicaAudit({type:'rename',status:'success',storageId:Number(storageId),fromRelative,toRelative,relativePath:toRelative,message:'按相同 MD5 建议完成名称修复'});
    return {renamed:true,storageId:Number(storageId),fromRelative,toRelative,preview:refreshed,apiStats:metrics};
  }catch(e){
    await appendReplicaAudit({type:'rename',status:'failed',storageId:Number(storageId),fromRelative,toRelative,relativePath:toRelative,message:e?.message||'名称修复失败'}).catch(()=>{});
    throw e;
  }
}

export async function quarantineReplicaExtras({items=[]}={}){
  const {config,replica}=await context();if(!replica.allowQuarantine)throw err('REPLICA_QUARANTINE_DISABLED','请先开启“允许移动到隔离区”');
  const preview=await currentPreview();const selected=(items||[]).slice(0,50),moved=[],failed=[];const today=new Date().toISOString().slice(0,10);const touched=new Set(),seenDirs=new Set(),metrics=makeMetrics();
  for(const item of selected){
    const mount=preview.mounts.find(x=>Number(x.storageId)===Number(item.storageId));const cfg=replica.mounts.find(x=>Number(x.storageId)===Number(item.storageId));
    if(!mount||mount.error||!cfg?.writable||!mount.extra.some(x=>x.relativePath===item.relativePath)){
      const row={...item,message:'不是当前可隔离的多余 IPA，或目标网盘不可写'};failed.push(row);
      await appendReplicaAudit({type:'quarantine',status:'failed',storageId:Number(item.storageId),relativePath:item.relativePath,message:row.message}).catch(()=>{});continue;
    }
    try{
      const src=fullFromRelative(cfg.rootPath,item.relativePath),srcDir=path.posix.dirname(src),name=path.posix.basename(src);const relativeDir=path.posix.dirname(item.relativePath)==='.'?'':path.posix.dirname(item.relativePath);
      const dstDir=joinPath(cfg.rootPath,replica.quarantineFolder,today,relativeDir);await ensureDir(config,dstDir,seenDirs,metrics);await openListRequest(config,'/api/fs/move',{body:{src_dir:srcDir,dst_dir:dstDir,names:[name]},metrics});moved.push(item);touched.add(Number(item.storageId));
      await appendReplicaAudit({type:'quarantine',status:'success',storageId:Number(item.storageId),relativePath:item.relativePath,message:`已移动到 ${replica.quarantineFolder}/${today}`}).catch(()=>{});
    }catch(e){
      const row={...item,message:e?.message||'隔离失败'};failed.push(row);
      await appendReplicaAudit({type:'quarantine',status:'failed',storageId:Number(item.storageId),relativePath:item.relativePath,message:row.message}).catch(()=>{});
    }
  }
  let refreshed=null;if(touched.size){await invalidateReplicaSnapshots(replicaScopeKey(config),[...touched]);refreshed=await previewReplicas({forceRefresh:true,storageIds:[...touched]})}
  return {moved,failed,quarantineFolder:replica.quarantineFolder,permanentDelete:false,preview:refreshed,apiStats:metrics};
}
