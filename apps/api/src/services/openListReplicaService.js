import path from 'node:path';
import { listMysqlSources,getOpenListConfig,readOpenListIpaCache,readOpenListReplicaConfig,writeOpenListReplicaConfig } from '../storage/controlStore.js';
import { fromHex,parseTsv,runMysql,safeIdentifier } from './mysqlCli.js';
import { publicUrlToApiPath } from './openListMetadataService.js';
import { readReplicaPreview,writeReplicaPreview,clearReplicaPreview } from './replicaPreviewStore.js';

const PAGE_SIZE=500;
const MAX_SCAN_FILES=20000;
const MAX_SCAN_DIRS=1000;

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

async function openListRequest(config,apiPath,{method='POST',body,query,timeoutMs=30000}={}){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const base=String(config.url||'').replace(/\/+$/,'');
    const u=new URL(`${base}${apiPath}`);
    for(const [k,v] of Object.entries(query||{}))if(v!==undefined&&v!==null)u.searchParams.set(k,String(v));
    const options={method,headers:{Authorization:config.token,'User-Agent':'zonoe-openlist-replica/1.0'},signal:controller.signal};
    if(body!==undefined){options.headers['Content-Type']='application/json';options.body=JSON.stringify(body)}
    const res=await fetch(u,options);const json=await res.json().catch(()=>null);
    if(!res.ok||!json||json.code!==200)throw err('OPENLIST_API_FAILED',json?.message||`OpenList HTTP ${res.status}`,{status:res.status,apiPath});
    return json.data;
  }finally{clearTimeout(timer)}
}

export async function listOpenListStorages(config){
  const data=await openListRequest(config,'/api/admin/storage/list',{method:'GET',query:{page:1,per_page:500}});
  return (Array.isArray(data?.content)?data.content:[]).map(x=>({
    id:Number(x.id),mountPath:cleanPath(x.mount_path||'/'),driver:String(x.driver||''),status:String(x.status||''),disabled:x.disabled===true,remark:String(x.remark||''),modified:x.modified||null,
    _addition:x.addition
  }));
}

async function listIpaTree(config,rootPath){
  rootPath=cleanPath(rootPath);const queue=[rootPath],files={};let dirs=0,seen=0;
  while(queue.length){
    const dir=queue.shift();dirs+=1;if(dirs>MAX_SCAN_DIRS)throw err('REPLICA_SCAN_LIMIT','目录数量过多，已停止扫描');
    let pageNo=1,total=0,pageSeen=0;
    while(true){
      const data=await openListRequest(config,'/api/fs/list',{body:{path:dir,password:'',page:pageNo,per_page:PAGE_SIZE,refresh:false}});
      const content=Array.isArray(data?.content)?data.content:[];total=Number(data?.total||content.length||0);pageSeen+=content.length;
      for(const item of content){
        const full=joinPath(dir,String(item?.name||''));
        if(item?.is_dir){queue.push(full);continue}
        if(!String(item?.name||'').toLowerCase().endsWith('.ipa'))continue;
        const relative=relPath(rootPath,full);if(relative===null)continue;
        files[relative]={relativePath:relative,name:String(item?.name||''),fullPath:full,size:Number(item?.size||0),modified:String(item?.modified||''),md5:md5Of(item)};
        seen+=1;if(seen>MAX_SCAN_FILES)throw err('REPLICA_SCAN_LIMIT','IPA 数量超过安全扫描上限');
      }
      if(content.length===0||pageSeen>=total)break;
      pageNo+=1;if(pageNo>1000)throw err('REPLICA_SCAN_LIMIT','OpenList 分页数量异常');
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
        if(!byPath.has(relativePath))byPath.set(relativePath,{relativePath,apiPath,fileName:path.posix.basename(relativePath),apps:[],md5:String(cache.files?.[apiPath]?.md5||'').toUpperCase(),size:Number(cache.files?.[apiPath]?.size||0)});
        byPath.get(relativePath).apps.push(app);
      }
    }catch(e){sourceErrors.push({source:source.slug,message:e?.message||'读取软件源失败'})}
  }
  return {items:[...byPath.values()].sort((a,b)=>a.relativePath.localeCompare(b.relativePath)),ignored,sourceErrors};
}

function sameDir(a,b){return path.posix.dirname(a||'')===path.posix.dirname(b||'')}
export function buildReplicaDiff(expectedItems,mountSnapshots){
  const expected=new Map((expectedItems||[]).map(x=>[x.relativePath,x]));
  const rows=[];const perMount=[];
  for(const snap of mountSnapshots||[]){
    const actual=snap.files||{};const missing=[],extra=[];
    for(const item of expected.values())if(!actual[item.relativePath])missing.push(item);
    for(const item of Object.values(actual))if(!expected.has(item.relativePath))extra.push(item);
    const extraByMd5=new Map();for(const x of extra)if(x.md5){if(!extraByMd5.has(x.md5))extraByMd5.set(x.md5,[]);extraByMd5.get(x.md5).push(x)}
    const renameSuggestions=[];
    for(const x of missing){if(!x.md5)continue;const candidates=extraByMd5.get(x.md5)||[];const same=candidates.filter(c=>sameDir(c.relativePath,x.relativePath));if(same.length===1)renameSuggestions.push({fromRelative:same[0].relativePath,toRelative:x.relativePath,md5:x.md5})}
    perMount.push({storageId:snap.storageId,label:snap.label,mountPath:snap.mountPath,rootPath:snap.rootPath,writable:snap.writable,error:snap.error||null,total:Object.keys(actual).length,expected:expected.size,present:expected.size-missing.length,missing,extra,renameSuggestions});
  }
  for(const item of expected.values()){
    const copies={};for(const snap of mountSnapshots||[])copies[snap.storageId]=Boolean(snap.files?.[item.relativePath]);
    rows.push({...item,copies});
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
  const {config,replica}=await context();let storages=[],storageError=null;
  try{storages=await listOpenListStorages(config)}catch(e){storageError=e?.message||'无法读取 OpenList 存储列表'}
  return {config:replica,openListUrl:String(config.url||''),storages:storages.map(publicStorage),storageError,alias:storages.length?aliasStatus(storages,replica):null,lastPreview:await readReplicaPreview()};
}

export async function saveReplicaManagerConfig(input){
  const {config}=await context();const storages=await listOpenListStorages(config);const byId=new Map(storages.map(x=>[x.id,x]));
  const mounts=(Array.isArray(input?.mounts)?input.mounts:[]).map(x=>{
    const storage=byId.get(Number(x.storageId));if(!storage)throw err('REPLICA_CONFIG_INVALID',`OpenList 存储 ${x.storageId} 不存在`);
    if(String(storage.driver).toLowerCase()==='alias')throw err('REPLICA_CONFIG_INVALID',`Alias ${storage.mountPath} 只能用于分流检查，不能作为实体副本盘`);
    const rootPath=cleanPath(x.rootPath||storage.mountPath);if(!validateRoot(storage.mountPath,rootPath))throw err('REPLICA_CONFIG_INVALID',`副本目录 ${rootPath} 必须位于挂载 ${storage.mountPath} 内`);
    return {storageId:storage.id,mountPath:storage.mountPath,rootPath,enabled:x.enabled!==false,writable:x.writable===true,label:String(x.label||storage.remark||storage.mountPath)};
  });
  const ids=mounts.map(x=>x.storageId);if(new Set(ids).size!==ids.length)throw err('REPLICA_CONFIG_INVALID','同一个 OpenList 存储不能重复选择');
  const saved=await writeOpenListReplicaConfig({...input,mounts});
  await clearReplicaPreview();
  return saved;
}

export async function previewReplicas(){
  const {config,replica}=await context();if(!replica.enabled)throw err('REPLICA_DISABLED','云盘副本管理尚未启用');
  const storages=await listOpenListStorages(config),byId=new Map(storages.map(x=>[x.id,x]));
  const expected=await readExpected(config);const snapshots=[];
  for(const mount of replica.mounts.filter(x=>x.enabled!==false)){
    const storage=byId.get(mount.storageId);if(!storage){snapshots.push({...mount,files:{},error:'OpenList 中已找不到此存储'});continue}
    if(storage.disabled){snapshots.push({...mount,label:mount.label||storage.remark||storage.mountPath,files:{},error:'此 OpenList 存储当前已禁用'});continue}
    try{snapshots.push({...mount,label:mount.label||storage.remark||storage.mountPath,files:await listIpaTree(config,mount.rootPath)})}
    catch(e){snapshots.push({...mount,label:mount.label||storage.remark||storage.mountPath,files:{},error:e?.message||'扫描失败'})}
  }
  const diff=buildReplicaDiff(expected.items,snapshots);
  const result={...diff,generatedAt:new Date().toISOString(),ignoredDatabaseRefs:expected.ignored,sourceErrors:expected.sourceErrors,alias:aliasStatus(storages,replica),permissions:{allowCopy:replica.allowCopy,allowRename:replica.allowRename,allowQuarantine:replica.allowQuarantine}};
  await writeReplicaPreview(result);
  return result;
}

async function ensureDir(config,dir){
  dir=cleanPath(dir);if(dir==='/')return;
  const parts=dir.split('/').filter(Boolean);let current='';
  for(const part of parts){current+=`/${part}`;try{await openListRequest(config,'/api/fs/mkdir',{body:{path:current}})}catch(e){if(!/exist|已存在|already/i.test(String(e.message||'')))throw e}}
}
function fullFromRelative(root,relative){return joinPath(root,String(relative||'').replace(/^\/+/,''))}

export async function syncMissingReplicas({limit=20,targetStorageIds=[]}={}){
  const {config,replica}=await context();if(!replica.enabled)throw err('REPLICA_DISABLED','云盘副本管理尚未启用');if(!replica.allowCopy)throw err('REPLICA_COPY_DISABLED','请先开启“允许副本复制”');
  const preview=await previewReplicas();const targetSet=new Set((targetStorageIds||[]).map(Number));const mountCfg=new Map(replica.mounts.map(x=>[x.storageId,x]));const mountState=new Map((preview.mounts||[]).map(x=>[Number(x.storageId),x]));const actions=[];const cap=Math.min(50,Math.max(1,Number(limit)||20));
  for(const row of preview.rows){
    const sourceId=Object.entries(row.copies).find(([id,present])=>present&&!mountState.get(Number(id))?.error)?.[0];if(!sourceId)continue;
    const source=mountCfg.get(Number(sourceId));if(!source)continue;
    for(const [id,present] of Object.entries(row.copies)){
      if(present)continue;const target=mountCfg.get(Number(id)),state=mountState.get(Number(id));if(!target||!target.writable||state?.error)continue;if(targetSet.size&&!targetSet.has(Number(id)))continue;
      if(state?.renameSuggestions?.some(x=>x.toRelative===row.relativePath))continue;
      actions.push({relativePath:row.relativePath,source,target});if(actions.length>=cap)break;
    }
    if(actions.length>=cap)break;
  }
  const queued=[],failed=[];
  for(const a of actions){
    try{
      const src=fullFromRelative(a.source.rootPath,a.relativePath),dst=fullFromRelative(a.target.rootPath,a.relativePath);const srcDir=path.posix.dirname(src),dstDir=path.posix.dirname(dst),name=path.posix.basename(src);
      await ensureDir(config,dstDir);await openListRequest(config,'/api/fs/copy',{body:{src_dir:srcDir,dst_dir:dstDir,names:[name]}});
      queued.push({relativePath:a.relativePath,sourceStorageId:a.source.storageId,targetStorageId:a.target.storageId});
    }catch(e){failed.push({relativePath:a.relativePath,targetStorageId:a.target.storageId,message:e?.message||'复制失败'})}
  }
  return {queued,failed,submitted:actions.length,note:'OpenList 跨存储复制可能进入后台任务队列；完成后重新对账即可确认副本。'};
}

export async function renameReplicaSuggestion({storageId,fromRelative,toRelative}){
  const {config,replica}=await context();if(!replica.allowRename)throw err('REPLICA_RENAME_DISABLED','请先开启“允许名称修复”');
  const preview=await previewReplicas();const mount=preview.mounts.find(x=>Number(x.storageId)===Number(storageId));
  const valid=mount?.renameSuggestions?.some(x=>x.fromRelative===fromRelative&&x.toRelative===toRelative);if(!valid)throw err('REPLICA_RENAME_NOT_SUGGESTED','当前对账结果不再支持这条重命名建议，请重新预览');
  const cfg=replica.mounts.find(x=>Number(x.storageId)===Number(storageId));if(!cfg?.writable)throw err('REPLICA_TARGET_READONLY','目标网盘未标记为可写');
  const source=fullFromRelative(cfg.rootPath,fromRelative);await openListRequest(config,'/api/fs/rename',{body:{path:source,name:path.posix.basename(toRelative)}});
  return {renamed:true,storageId:Number(storageId),fromRelative,toRelative};
}

export async function quarantineReplicaExtras({items=[]}={}){
  const {config,replica}=await context();if(!replica.allowQuarantine)throw err('REPLICA_QUARANTINE_DISABLED','请先开启“允许移动到隔离区”');
  const preview=await previewReplicas();const selected=(items||[]).slice(0,50),moved=[],failed=[];const today=new Date().toISOString().slice(0,10);
  for(const item of selected){
    const mount=preview.mounts.find(x=>Number(x.storageId)===Number(item.storageId));const cfg=replica.mounts.find(x=>Number(x.storageId)===Number(item.storageId));
    if(!mount||mount.error||!cfg?.writable||!mount.extra.some(x=>x.relativePath===item.relativePath)){failed.push({...item,message:'不是当前可隔离的多余 IPA，或目标网盘不可写'});continue}
    try{
      const src=fullFromRelative(cfg.rootPath,item.relativePath),srcDir=path.posix.dirname(src),name=path.posix.basename(src);const relativeDir=path.posix.dirname(item.relativePath)==='.'?'':path.posix.dirname(item.relativePath);
      const dstDir=joinPath(cfg.rootPath,replica.quarantineFolder,today,relativeDir);await ensureDir(config,dstDir);await openListRequest(config,'/api/fs/move',{body:{src_dir:srcDir,dst_dir:dstDir,names:[name]}});moved.push(item);
    }catch(e){failed.push({...item,message:e?.message||'隔离失败'})}
  }
  return {moved,failed,quarantineFolder:replica.quarantineFolder,permanentDelete:false};
}
