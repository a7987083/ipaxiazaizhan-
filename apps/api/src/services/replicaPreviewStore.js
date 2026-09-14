import fs from 'node:fs/promises';
import path from 'node:path';
import { CONTROL_DIR } from '../storage/controlStore.js';

export const REPLICA_PREVIEW_FILE=path.join(CONTROL_DIR,'openlist-replica-preview.json');
let writeQueue=Promise.resolve();

function normalize(value){
  if(!value||typeof value!=='object')return null;
  return {
    version:2,
    generatedAt:value.generatedAt||null,
    expectedCount:Number(value.expectedCount||0),
    mounts:Array.isArray(value.mounts)?value.mounts:[],
    rows:Array.isArray(value.rows)?value.rows:[],
    ignoredDatabaseRefs:Number(value.ignoredDatabaseRefs||0),
    sourceErrors:Array.isArray(value.sourceErrors)?value.sourceErrors:[],
    alias:value.alias||null,
    permissions:value.permissions||{},
    apiStats:value.apiStats||{},
    snapshotTtlMinutes:Number(value.snapshotTtlMinutes||30)
  };
}

export async function readReplicaPreview(){
  try{return normalize(JSON.parse(await fs.readFile(REPLICA_PREVIEW_FILE,'utf8')))}
  catch(e){if(e?.code==='ENOENT')return null;throw e}
}

export async function writeReplicaPreview(value){
  const normalized=normalize({...value,generatedAt:value?.generatedAt||new Date().toISOString()});
  if(!normalized)return null;
  await fs.mkdir(path.dirname(REPLICA_PREVIEW_FILE),{recursive:true,mode:0o750});
  const body=JSON.stringify(normalized,null,2)+'\n';
  writeQueue=writeQueue.then(async()=>{
    const tmp=`${REPLICA_PREVIEW_FILE}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tmp,body,{mode:0o600});
    await fs.rename(tmp,REPLICA_PREVIEW_FILE);
    await fs.chmod(REPLICA_PREVIEW_FILE,0o600).catch(()=>{});
  });
  await writeQueue;
  return normalized;
}

export async function clearReplicaPreview(){
  try{await fs.unlink(REPLICA_PREVIEW_FILE)}catch(e){if(e?.code!=='ENOENT')throw e}
}
