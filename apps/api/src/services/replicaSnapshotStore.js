import fs from 'node:fs/promises';
import path from 'node:path';
import { CONTROL_DIR } from '../storage/controlStore.js';

export const REPLICA_SNAPSHOT_FILE=path.join(CONTROL_DIR,'openlist-replica-snapshots.json');
export const REPLICA_SNAPSHOT_TTL_MS=30*60*1000;
let writeQueue=Promise.resolve();

function normalize(value={}){
  return {version:1,scopeKey:String(value?.scopeKey||''),mounts:value?.mounts&&typeof value.mounts==='object'?value.mounts:{},updatedAt:value?.updatedAt||null};
}
export function snapshotKey(storageId,rootPath){return `${Number(storageId)}|${String(rootPath||'')}`}
export function snapshotFresh(entry,now=Date.now()){
  const t=Date.parse(String(entry?.scannedAt||''));
  return Number.isFinite(t)&&now-t<REPLICA_SNAPSHOT_TTL_MS;
}
export async function readReplicaSnapshots(scopeKey=''){
  let data;
  try{data=normalize(JSON.parse(await fs.readFile(REPLICA_SNAPSHOT_FILE,'utf8')))}
  catch(e){if(e?.code==='ENOENT')data={version:1,scopeKey:'',mounts:{},updatedAt:null};else throw e}
  if(scopeKey&&data.scopeKey!==scopeKey)return {version:1,scopeKey,mounts:{},updatedAt:null};
  return data;
}
export async function writeReplicaSnapshots(value){
  const normalized=normalize({...value,updatedAt:new Date().toISOString()});
  await fs.mkdir(path.dirname(REPLICA_SNAPSHOT_FILE),{recursive:true,mode:0o750});
  const body=JSON.stringify(normalized,null,2)+'\n';
  writeQueue=writeQueue.then(async()=>{
    const tmp=`${REPLICA_SNAPSHOT_FILE}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tmp,body,{mode:0o600});
    await fs.rename(tmp,REPLICA_SNAPSHOT_FILE);
    await fs.chmod(REPLICA_SNAPSHOT_FILE,0o600).catch(()=>{});
  });
  await writeQueue;
  return normalized;
}
export async function invalidateReplicaSnapshots(scopeKey,storageIds=[]){
  const data=await readReplicaSnapshots(scopeKey);const ids=new Set((storageIds||[]).map(Number));
  if(!ids.size)return data;
  for(const [key,row] of Object.entries(data.mounts||{}))if(ids.has(Number(row?.storageId)))delete data.mounts[key];
  return writeReplicaSnapshots(data);
}
export async function clearReplicaSnapshots(scopeKey=''){
  return writeReplicaSnapshots({version:1,scopeKey,mounts:{}});
}
