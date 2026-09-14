import {createHash} from 'node:crypto';
import path from 'node:path';
import {getOpenListConfig,readOpenListReplicaConfig} from '../storage/controlStore.js';
import {previewReplicas,replicaIntegrityStatus,verifyReplicaOperationsNow} from './openListReplicaService.js';
import {appendReplicaAudit,createReplicaCopyBatch} from './replicaOperationStore.js';
import {invalidateReplicaSnapshots} from './replicaSnapshotStore.js';

function err(code,message,details){return Object.assign(new Error(message),{code,details})}
function cleanPath(v='/'){
  let s=String(v||'/').trim().replace(/\\/g,'/');
  if(!s.startsWith('/'))s=`/${s}`;
  s=path.posix.normalize(s);
  if(!s.startsWith('/'))s=`/${s}`;
  while(s.length>1&&s.endsWith('/'))s=s.slice(0,-1);
  return s||'/';
}
function joinPath(...parts){return cleanPath(path.posix.join(...parts))}
function fullFromRelative(root,relative){return joinPath(root,String(relative||'').replace(/^\/+/,''))}
function fingerprint(v){return createHash('sha256').update(String(v||'')).digest('hex').slice(0,16)}
function replicaScopeKey(config){return `${String(config.url||'').replace(/\/+$/,'')}|${fingerprint(config.token)}`}
function makeMetrics(){return {openListRequests:0,fsListRequests:0,fileOperationRequests:0}}
function operationKey(x){return `${String(x?.relativePath||'')}|${Number(x?.targetStorageId||0)}`}
function rowStatus(row,id){return String(row?.copyStatus?.[id]||(row?.copies?.[id]?'unverified':'missing'))}
function md5Of(item){
  if(item?.hash_info?.md5)return String(item.hash_info.md5).toUpperCase();
  try{return String(JSON.parse(item?.hashinfo||'{}')?.md5||'').toUpperCase()}catch{return ''}
}

async function context(){
  const row=await getOpenListConfig({withSecret:true});
  if(!row?.config?.url||!row?.config?.token)throw err('OPENLIST_CONFIG_REQUIRED','请先配置 OpenList URL 和令牌');
  return {config:row.config,replica:await readOpenListReplicaConfig()};
}
function assertRepairEnabled(replica){
  if(!replica.enabled)throw err('REPLICA_DISABLED','云盘副本管理尚未启用');
  if(!replica.allowRepair)throw err('REPLICA_REPAIR_DISABLED','请先开启“允许异常副本修复”');
  if(!replica.allowCopy)throw err('REPLICA_COPY_DISABLED','异常修复需要同时开启“允许副本复制”');
  if(!replica.allowQuarantine)throw err('REPLICA_QUARANTINE_DISABLED','异常修复需要同时开启“允许移动到隔离区”');
}

async function openListRequest(config,apiPath,{body,timeoutMs=30000,metrics}={}){
  if(metrics){metrics.openListRequests+=1;if(apiPath==='/api/fs/list')metrics.fsListRequests+=1;else if(apiPath.startsWith('/api/fs/'))metrics.fileOperationRequests+=1}
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const base=String(config.url||'').replace(/\/+$/,'');
    const options={method:'POST',headers:{Authorization:config.token,'User-Agent':'zonoe-openlist-repair/1.0','Content-Type':'application/json'},body:JSON.stringify(body||{}),signal:controller.signal};
    const res=await fetch(`${base}${apiPath}`,options);const json=await res.json().catch(()=>null);
    if(!res.ok||!json||json.code!==200)throw err('OPENLIST_API_FAILED',json?.message||`OpenList HTTP ${res.status}`,{status:res.status,apiPath,openListCode:json?.code});
    return json.data;
  }finally{clearTimeout(timer)}
}
async function ensureDir(config,dir,seenDirs,metrics){
  dir=cleanPath(dir);if(dir==='/'||seenDirs.has(dir))return;
  const parts=dir.split('/').filter(Boolean);let current='';
  for(const part of parts){
    current+=`/${part}`;if(seenDirs.has(current))continue;
    try{await openListRequest(config,'/api/fs/mkdir',{body:{path:current},metrics})}
    catch(e){if(!/exist|已存在|already/i.test(String(e.message||'')))throw e}
    seenDirs.add(current);
  }
}
async function inspectFile(config,{rootPath,relativePath,storageId,expectedMd5},metrics,directoryCache){
  const full=fullFromRelative(rootPath,relativePath);
  const detail=await openListRequest(config,'/api/fs/get',{body:{path:full,password:''},timeoutMs:15000,metrics});
  const actual={size:Number(detail?.size||0),md5:md5Of(detail)};
  if(expectedMd5&&!actual.md5){
    const dir=path.posix.dirname(full),name=path.posix.basename(full),key=`${Number(storageId)}|${dir}`;
    let content=directoryCache.get(key);
    if(!content){
      const listed=await openListRequest(config,'/api/fs/list',{body:{path:dir,password:'',page:1,per_page:0,refresh:true},timeoutMs:20000,metrics});
      content=Array.isArray(listed?.content)?listed.content:[];directoryCache.set(key,content);
    }
    const item=content.find(x=>String(x?.name||'')===name);
    if(item){actual.size=Number(item?.size||actual.size||0);actual.md5=md5Of(item)}
  }
  return actual;
}

export function buildReplicaRepairPlan(preview,replica,{limit=20,targetStorageIds=[]}={}){
  const cap=Math.min(50,Math.max(1,Number(limit)||20));
  const targetSet=new Set((targetStorageIds||[]).map(Number));
  const mounts=(replica?.mounts||[]).filter(x=>x.enabled!==false);
  const mountState=new Map((preview?.mounts||[]).map(x=>[Number(x.storageId),x]));
  const priority=new Map(mounts.map((x,i)=>[Number(x.storageId),i]));
  const actions=[];let skippedNoVerifiedSource=0,skippedReadonly=0;
  for(const row of preview?.rows||[]){
    const verifiedSources=mounts.map(m=>({mount:m,status:rowStatus(row,m.storageId),state:mountState.get(Number(m.storageId))}))
      .filter(x=>!x.state?.error&&x.status==='verified')
      .sort((a,b)=>(priority.get(Number(a.mount.storageId))??9999)-(priority.get(Number(b.mount.storageId))??9999));
    for(const target of mounts){
      const id=Number(target.storageId),state=mountState.get(id),status=rowStatus(row,id);
      if(targetSet.size&&!targetSet.has(id))continue;
      if(!['md5_mismatch','size_mismatch'].includes(status))continue;
      if(!target.writable||state?.error){skippedReadonly+=1;continue}
      const source=verifiedSources.find(x=>Number(x.mount.storageId)!==id);
      if(!source){skippedNoVerifiedSource+=1;continue}
      const issue=(state?.integrityIssues||[]).find(x=>x.relativePath===row.relativePath&&x.status===status)||{};
      actions.push({
        relativePath:row.relativePath,sourceStorageId:Number(source.mount.storageId),sourceLabel:source.mount.label||source.mount.mountPath,sourceStatus:'verified',
        targetStorageId:id,targetLabel:target.label||target.mountPath,targetStatus:status,sourceRootPath:String(source.mount.rootPath||''),targetRootPath:String(target.rootPath||''),targetMountPath:String(target.mountPath||''),
        expectedMd5:String(row.md5||'').toUpperCase(),expectedSize:Number(row.size||0),targetActualMd5:String(issue.actualMd5||'').toUpperCase(),targetActualSize:Number(issue.actualSize||0)
      });
      if(actions.length>=cap)break;
    }
    if(actions.length>=cap)break;
  }
  const hashBody=actions.map(x=>[x.relativePath,x.sourceStorageId,x.sourceRootPath,x.targetStorageId,x.targetRootPath,x.targetMountPath,x.targetStatus,x.expectedMd5,x.expectedSize,x.targetActualMd5,x.targetActualSize]);
  const planHash=createHash('sha256').update(JSON.stringify(hashBody)).digest('hex');
  return {
    generatedAt:new Date().toISOString(),previewGeneratedAt:preview?.generatedAt||null,limit:cap,targetStorageIds:[...targetSet],
    sourcePriority:mounts.map((x,i)=>({rank:i+1,storageId:Number(x.storageId),label:x.label||x.mountPath})),
    actions,planHash,summary:{actions:actions.length,md5Mismatches:actions.filter(x=>x.targetStatus==='md5_mismatch').length,sizeMismatches:actions.filter(x=>x.targetStatus==='size_mismatch').length,skippedNoVerifiedSource,skippedReadonly}
  };
}

export async function previewReplicaRepairPlan({limit=20,targetStorageIds=[]}={}){
  const {replica}=await context();assertRepairEnabled(replica);
  const preview=await previewReplicas({forceRefresh:false});
  return buildReplicaRepairPlan(preview,replica,{limit,targetStorageIds});
}

export async function repairIntegrityReplicas({limit=20,targetStorageIds=[],planHash=''}={}){
  const {config,replica}=await context();assertRepairEnabled(replica);
  const preview=await previewReplicas({forceRefresh:false});const plan=buildReplicaRepairPlan(preview,replica,{limit,targetStorageIds});
  if(!planHash||String(planHash)!==plan.planHash)throw err('REPLICA_REPAIR_PLAN_CHANGED','异常副本、正确来源或期望内容已变化，请重新预览修复计划',{expected:plan.planHash,received:String(planHash||'')});
  const mountCfg=new Map((replica.mounts||[]).map(x=>[Number(x.storageId),x]));
  const queued=[],failed=[],quarantined=[],touched=new Set(),queuedTargets=new Set(),seenDirs=new Set(),metrics=makeMetrics(),directoryCache=new Map();
  const today=new Date().toISOString().slice(0,10);const repairId=`repair-${Date.now()}-${plan.planHash.slice(0,8)}`;
  for(const a of plan.actions){
    const source=mountCfg.get(Number(a.sourceStorageId)),target=mountCfg.get(Number(a.targetStorageId));let moved=false;
    if(!source||!target||!target.writable){failed.push({...a,message:'副本配置已变化，找不到来源盘/目标盘或目标盘已变为只读'});continue}
    try{
      const expected={md5:a.expectedMd5,size:a.expectedSize};
      const sourceActual=await inspectFile(config,{rootPath:source.rootPath,relativePath:a.relativePath,storageId:source.storageId,expectedMd5:a.expectedMd5},metrics,directoryCache);
      if(replicaIntegrityStatus(expected,sourceActual)!=='verified')throw err('REPLICA_REPAIR_SOURCE_CHANGED','正确来源不再是 MD5 已验证副本，已停止修复');
      const targetActual=await inspectFile(config,{rootPath:target.rootPath,relativePath:a.relativePath,storageId:target.storageId,expectedMd5:a.expectedMd5},metrics,directoryCache);
      const liveTargetStatus=replicaIntegrityStatus(expected,targetActual);
      if(!['md5_mismatch','size_mismatch'].includes(liveTargetStatus))throw err('REPLICA_REPAIR_TARGET_CHANGED','目标副本已不再是完整性异常，已停止修复');
      if(a.targetActualMd5&&targetActual.md5&&String(a.targetActualMd5)!==String(targetActual.md5).toUpperCase())throw err('REPLICA_REPAIR_TARGET_CHANGED','目标异常文件 MD5 已变化，请重新对账');
      if(Number(a.targetActualSize||0)>0&&Number(targetActual.size||0)>0&&Number(a.targetActualSize)!==Number(targetActual.size))throw err('REPLICA_REPAIR_TARGET_CHANGED','目标异常文件大小已变化，请重新对账');

      const src=fullFromRelative(source.rootPath,a.relativePath),dst=fullFromRelative(target.rootPath,a.relativePath),srcDir=path.posix.dirname(src),dstDir=path.posix.dirname(dst),name=path.posix.basename(dst);
      const relativeDir=path.posix.dirname(a.relativePath)==='.'?'':path.posix.dirname(a.relativePath);
      const quarantineBase=cleanPath(target.mountPath||a.targetMountPath||target.rootPath);
      const quarantineDir=joinPath(quarantineBase,replica.quarantineFolder,'repair',today,repairId,relativeDir);
      await ensureDir(config,quarantineDir,seenDirs,metrics);

      // Current OpenList /api/fs/move returns after scheduling an async task.
      // First free the canonical target name with synchronous /api/fs/rename, then the
      // asynchronous move can no longer race the refill copy for the original filename.
      const stagedName=`.zonoe-repair-${repairId}-${fingerprint(name)}.quarantine`;
      await openListRequest(config,'/api/fs/rename',{body:{path:dst,name:stagedName},metrics});
      moved=true;touched.add(Number(target.storageId));
      const stagedPath=joinPath(dstDir,stagedName),quarantinePath=joinPath(quarantineDir,stagedName);
      let quarantineMoveAccepted=false,quarantineMoveError='';
      try{
        await openListRequest(config,'/api/fs/move',{body:{src_dir:dstDir,dst_dir:quarantineDir,names:[stagedName]},metrics});
        quarantineMoveAccepted=true;
        await appendReplicaAudit({type:'repair_quarantine_move',status:'submitted',storageId:Number(target.storageId),relativePath:a.relativePath,sourceStorageId:Number(source.storageId),targetStorageId:Number(target.storageId),message:`隔离文件移动任务已提交：${quarantinePath}`}).catch(()=>{});
      }catch(moveError){
        quarantineMoveError=moveError?.message||'隔离文件移动任务提交失败';
        await appendReplicaAudit({type:'repair_quarantine_move',status:'failed',storageId:Number(target.storageId),relativePath:a.relativePath,sourceStorageId:Number(source.storageId),targetStorageId:Number(target.storageId),message:`异常副本已原地隔离为 ${stagedPath}；${quarantineMoveError}`}).catch(()=>{});
      }
      quarantined.push({...a,stagedPath,quarantinePath,quarantineMoveAccepted,quarantineMoveError});
      await appendReplicaAudit({type:'repair_quarantine',status:'success',storageId:Number(target.storageId),relativePath:a.relativePath,sourceStorageId:Number(source.storageId),targetStorageId:Number(target.storageId),message:`异常副本已同步改名隔离为 ${stagedPath}${quarantineMoveAccepted?`；移动到 ${quarantinePath} 的后台任务已提交`:'；即使移动任务失败也不会覆盖或删除该隔离文件'}`}).catch(()=>{});

      await ensureDir(config,dstDir,seenDirs,metrics);
      await openListRequest(config,'/api/fs/copy',{body:{src_dir:srcDir,dst_dir:dstDir,names:[path.posix.basename(src)]},metrics});
      queued.push({...a,stagedPath,quarantinePath,quarantineMoveAccepted});queuedTargets.add(Number(target.storageId));
      await appendReplicaAudit({type:'repair_refill',status:'submitted',storageId:Number(target.storageId),relativePath:a.relativePath,sourceStorageId:Number(source.storageId),targetStorageId:Number(target.storageId),message:'异常副本已同步改名隔离；已从 MD5 已验证来源提交补回，等待独立核验'}).catch(()=>{});
    }catch(e){
      const message=moved?`异常副本已同步改名隔离，但补回未完成：${e?.message||'修复失败'}`:(e?.message||'修复失败');
      failed.push({...a,message,quarantined:moved});
      await appendReplicaAudit({type:moved?'repair_refill':'repair_precheck',status:'failed',storageId:Number(a.targetStorageId),relativePath:a.relativePath,sourceStorageId:Number(a.sourceStorageId),targetStorageId:Number(a.targetStorageId),message}).catch(()=>{});
    }
  }
  const scope=replicaScopeKey(config);if(touched.size)await invalidateReplicaSnapshots(scope,[...touched]);
  const failedByKey=new Map(failed.map(x=>[operationKey(x),x]));const queuedKeys=new Set(queued.map(operationKey));
  const tracking=await createReplicaCopyBatch({
    scopeKey:scope,planHash:plan.planHash,previewGeneratedAt:plan.previewGeneratedAt,
    actions:plan.actions.map(a=>{const failure=failedByKey.get(operationKey(a));return {...a,status:queuedKeys.has(operationKey(a))?'submitted':'failed',error:failure?.message||'',message:failure?.message||'异常副本已隔离并提交正确副本补回，等待目标文件验证'}})
  });
  if(queued.length){const timer=setTimeout(()=>verifyReplicaOperationsNow().catch(()=>{}),1500);timer.unref?.()}
  const failedOnlyTargets=[...touched].filter(id=>!queuedTargets.has(Number(id)));let failedOnlyPreview=null;
  if(failedOnlyTargets.length){
    try{failedOnlyPreview=await previewReplicas({forceRefresh:true,storageIds:failedOnlyTargets});await appendReplicaAudit({type:'repair_target_refresh',status:'success',message:`隔离后已刷新 ${failedOnlyTargets.length} 个未进入补回队列的目标盘`}).catch(()=>{})}
    catch(e){await appendReplicaAudit({type:'repair_target_refresh',status:'failed',message:e?.message||'隔离后目标盘刷新失败'}).catch(()=>{})}
  }
  return {
    repairedSubmitted:queued,failed,quarantined,submitted:plan.actions.length,executedPlanHash:plan.planHash,trackingBatchId:tracking?.batch?.id||'',trackingBatch:tracking?.batch||null,
    targetSnapshotsInvalidated:[...touched],failedOnlyTargetsRefreshed:failedOnlyTargets,failedOnlyPreview,permanentDelete:false,apiStats:metrics,
    note:'异常副本先同步改名隔离，避免 OpenList 异步 move 与补回 copy 竞争；随后提交后台移动到隔离目录并从 MD5 已验证来源补回。不会永久删除。补回继续由副本任务页面独立核验。'
  };
}
