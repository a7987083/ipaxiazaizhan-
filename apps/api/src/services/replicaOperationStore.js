import fs from 'node:fs/promises';
import path from 'node:path';
import { CONTROL_DIR } from '../storage/controlStore.js';

export const REPLICA_OPERATION_FILE=path.join(CONTROL_DIR,'openlist-replica-operations.json');
export const REPLICA_OPERATION_MAX_BATCHES=200;
export const REPLICA_OPERATION_MAX_OPERATIONS=2000;
export const REPLICA_OPERATION_MAX_AUDIT=2000;
const ACTIVE_STATUSES=new Set(['submitted','waiting','verifying']);
const TERMINAL_STATUSES=new Set(['success','failed','timeout']);
let writeQueue=Promise.resolve();

function nowIso(){return new Date().toISOString()}
function id(prefix='op'){return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,9)}`}
function text(v,max=2000){return String(v??'').slice(0,max)}
function num(v){const n=Number(v);return Number.isFinite(n)&&n>=0?Math.round(n):0}
function uniqueNumbers(list=[]){return [...new Set((list||[]).map(Number).filter(Number.isFinite))]}

function normalizeOperation(x={}){
  const status=['submitted','waiting','verifying','success','failed','timeout'].includes(String(x.status))?String(x.status):'submitted';
  return {
    id:text(x.id||id('copy'),120),batchId:text(x.batchId,120),scopeKey:text(x.scopeKey,240),type:'copy',status,
    relativePath:text(x.relativePath),sourceStorageId:Number(x.sourceStorageId||0),targetStorageId:Number(x.targetStorageId||0),sourceRootPath:text(x.sourceRootPath,2000),targetRootPath:text(x.targetRootPath,2000),
    sourceLabel:text(x.sourceLabel,160),targetLabel:text(x.targetLabel,160),sourceStatus:text(x.sourceStatus,40),
    expectedMd5:text(x.expectedMd5,128).toUpperCase(),expectedSize:num(x.expectedSize),actualMd5:text(x.actualMd5,128).toUpperCase(),actualSize:num(x.actualSize),
    verification:text(x.verification,80),attempts:num(x.attempts),createdAt:x.createdAt||nowIso(),submittedAt:x.submittedAt||null,
    lastCheckedAt:x.lastCheckedAt||null,mismatchSince:x.mismatchSince||null,completedAt:x.completedAt||null,error:text(x.error,500),message:text(x.message,500)
  };
}
function normalizeBatch(x={}){
  return {
    id:text(x.id||id('batch'),120),scopeKey:text(x.scopeKey,240),type:'copy',status:text(x.status||'running',40),planHash:text(x.planHash,128),previewGeneratedAt:x.previewGeneratedAt||null,
    targetStorageIds:uniqueNumbers(x.targetStorageIds),createdAt:x.createdAt||nowIso(),completedAt:x.completedAt||null,refreshedAt:x.refreshedAt||null,
    refreshError:text(x.refreshError,500),refreshAttempts:num(x.refreshAttempts),lastRefreshAttemptAt:x.lastRefreshAttemptAt||null,counts:{total:num(x.counts?.total),active:num(x.counts?.active),success:num(x.counts?.success),failed:num(x.counts?.failed),timeout:num(x.counts?.timeout)}
  };
}
function normalizeAudit(x={}){
  return {
    id:text(x.id||id('audit'),120),at:x.at||nowIso(),type:text(x.type,80),status:text(x.status,40),batchId:text(x.batchId,120),
    relativePath:text(x.relativePath),sourceStorageId:Number(x.sourceStorageId||0),targetStorageId:Number(x.targetStorageId||0),storageId:Number(x.storageId||0),
    fromRelative:text(x.fromRelative),toRelative:text(x.toRelative),verification:text(x.verification,80),message:text(x.message,500)
  };
}
function normalize(value={}){
  return {
    version:1,
    batches:Array.isArray(value?.batches)?value.batches.map(normalizeBatch):[],
    operations:Array.isArray(value?.operations)?value.operations.map(normalizeOperation):[],
    audit:Array.isArray(value?.audit)?value.audit.map(normalizeAudit):[],
    updatedAt:value?.updatedAt||null
  };
}
function prune(data){
  data.batches=data.batches.slice(-REPLICA_OPERATION_MAX_BATCHES);
  const batchIds=new Set(data.batches.map(x=>x.id));
  data.operations=data.operations.filter(x=>batchIds.has(x.batchId)).slice(-REPLICA_OPERATION_MAX_OPERATIONS);
  data.audit=data.audit.slice(-REPLICA_OPERATION_MAX_AUDIT);
  return data;
}
function recomputeBatch(batch,operations,at=nowIso()){
  const rows=operations.filter(x=>x.batchId===batch.id);
  const counts={
    total:rows.length,
    active:rows.filter(x=>ACTIVE_STATUSES.has(x.status)).length,
    success:rows.filter(x=>x.status==='success').length,
    failed:rows.filter(x=>x.status==='failed').length,
    timeout:rows.filter(x=>x.status==='timeout').length
  };
  let status='running';
  if(counts.active===0){
    if(counts.total>0&&counts.success===counts.total)status='success';
    else if(counts.success>0)status='partial';
    else if(counts.timeout>0&&counts.failed===0)status='timeout';
    else status='failed';
  }
  return normalizeBatch({...batch,status,counts,completedAt:counts.active===0?(batch.completedAt||at):null});
}
async function readUnlocked(){
  try{return normalize(JSON.parse(await fs.readFile(REPLICA_OPERATION_FILE,'utf8')))}
  catch(e){if(e?.code==='ENOENT')return normalize({});throw e}
}
async function writeUnlocked(value){
  const next=prune(normalize({...value,updatedAt:nowIso()}));
  await fs.mkdir(path.dirname(REPLICA_OPERATION_FILE),{recursive:true,mode:0o750});
  const tmp=`${REPLICA_OPERATION_FILE}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp,JSON.stringify(next,null,2)+'\n',{mode:0o600});
  await fs.rename(tmp,REPLICA_OPERATION_FILE);
  await fs.chmod(REPLICA_OPERATION_FILE,0o600).catch(()=>{});
  return next;
}
async function mutate(mutator){
  let result;
  writeQueue=writeQueue.catch(()=>{}).then(async()=>{
    const data=await readUnlocked();
    result=await mutator(data);
    await writeUnlocked(data);
  });
  await writeQueue;
  return result;
}

export function summarizeReplicaOperationState(value={}){
  const data=normalize(value);const ops=data.operations;
  return {
    total:ops.length,
    active:ops.filter(x=>ACTIVE_STATUSES.has(x.status)).length,
    success:ops.filter(x=>x.status==='success').length,
    failed:ops.filter(x=>x.status==='failed').length,
    timeout:ops.filter(x=>x.status==='timeout').length,
    batchesActive:data.batches.filter(x=>x.status==='running').length
  };
}
export async function readReplicaOperationStore(){return readUnlocked()}
export async function getReplicaOperationState({limit=100}={}){
  const data=await readUnlocked();const cap=Math.min(200,Math.max(1,Number(limit)||100));
  const byNewest=(a,b)=>Date.parse(b.createdAt||b.at||0)-Date.parse(a.createdAt||a.at||0);
  return {
    summary:summarizeReplicaOperationState(data),
    batches:[...data.batches].sort(byNewest).slice(0,Math.min(50,cap)),
    operations:[...data.operations].sort(byNewest).slice(0,cap),
    audit:[...data.audit].sort((a,b)=>Date.parse(b.at||0)-Date.parse(a.at||0)).slice(0,cap),
    updatedAt:data.updatedAt
  };
}
export async function getPendingReplicaCopyOperations(limit=100){
  const data=await readUnlocked();
  return data.operations.filter(x=>ACTIVE_STATUSES.has(x.status)).sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt)).slice(0,Math.max(1,Number(limit)||100));
}
export async function getReplicaBatchesNeedingRefresh(limit=20){
  const data=await readUnlocked();
  return data.batches.filter(x=>x.status!=='running'&&!x.refreshedAt&&Number(x.refreshAttempts||0)<3).sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt)).slice(0,Math.max(1,Number(limit)||20));
}
export async function createReplicaCopyBatch({scopeKey='',planHash='',previewGeneratedAt=null,actions=[]}={}){
  const createdAt=nowIso();const batchId=id('copybatch');
  return mutate(data=>{
    const operations=(actions||[]).map(a=>normalizeOperation({
      ...a,id:id('copy'),batchId,scopeKey,createdAt,submittedAt:a.status==='submitted'?createdAt:null,completedAt:TERMINAL_STATUSES.has(a.status)?createdAt:null
    }));
    data.operations.push(...operations);
    let batch=normalizeBatch({id:batchId,scopeKey,planHash,previewGeneratedAt,targetStorageIds:operations.map(x=>x.targetStorageId),createdAt});
    batch=recomputeBatch(batch,data.operations,createdAt);data.batches.push(batch);
    data.audit.push(normalizeAudit({type:'copy_batch',status:'submitted',batchId,at:createdAt,message:`计划 ${operations.length} 个；已提交 ${operations.filter(x=>x.status==='submitted').length}；提交失败 ${operations.filter(x=>x.status==='failed').length}`}));
    return {batch,operations};
  });
}
export async function applyReplicaOperationUpdates(updates=[],auditEvents=[]){
  return mutate(data=>{
    const byId=new Map((updates||[]).map(x=>[String(x.id),x]));const touched=new Set();
    data.operations=data.operations.map(old=>{
      const patch=byId.get(old.id);if(!patch)return old;
      const next=normalizeOperation({...old,...patch});touched.add(next.batchId);return next;
    });
    const changed=[];
    data.batches=data.batches.map(batch=>{
      if(!touched.has(batch.id))return batch;
      const next=recomputeBatch(batch,data.operations);changed.push(next);return next;
    });
    for(const event of auditEvents||[])data.audit.push(normalizeAudit(event));
    return {batches:changed};
  });
}
export async function markReplicaBatchRefresh(batchId,{refreshedAt=null,refreshError=''}={},auditEvent=null){
  return mutate(data=>{
    const idx=data.batches.findIndex(x=>x.id===String(batchId));if(idx<0)return null;
    data.batches[idx]=normalizeBatch({...data.batches[idx],refreshedAt:refreshedAt||data.batches[idx].refreshedAt,refreshError,refreshAttempts:Number(data.batches[idx].refreshAttempts||0)+1,lastRefreshAttemptAt:nowIso()});
    if(auditEvent)data.audit.push(normalizeAudit({...auditEvent,batchId:String(batchId)}));
    return data.batches[idx];
  });
}
export async function appendReplicaAudit(event){return mutate(data=>{const row=normalizeAudit(event);data.audit.push(row);return row})}
