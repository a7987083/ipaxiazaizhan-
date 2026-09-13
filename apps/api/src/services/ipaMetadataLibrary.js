import fs from 'node:fs/promises';
import path from 'node:path';
import { CONTROL_DIR } from '../storage/controlStore.js';

export const IPA_METADATA_LIBRARY_FILE=path.join(CONTROL_DIR,'openlist-ipa-metadata-library.json');
let writeQueue=Promise.resolve();

function normalizeMd5(value){
  const s=String(value||'').trim().toUpperCase();
  return /^[A-F0-9]{32}$/.test(s)?s:'';
}
function cleanParsed(value={}){
  return {
    name:String(value?.name||''),
    version:String(value?.version||''),
    build:String(value?.build||''),
    bundle_id:String(value?.bundle_id||''),
    minimum_ios:String(value?.minimum_ios||''),
    executable:String(value?.executable||'')
  };
}
function validParsed(value){
  return Boolean(value&&typeof value==='object'&&Object.values(cleanParsed(value)).some(Boolean));
}
function normalizeSize(value){
  const n=Number(value||0);
  return Number.isFinite(n)&&n>0?Math.round(n):0;
}
function normalizeEntry(md5,value={}){
  md5=normalizeMd5(md5||value?.md5);
  if(!md5||!validParsed(value?.parsed))return null;
  return {
    md5,
    size:normalizeSize(value?.size),
    parsed:cleanParsed(value.parsed),
    parsedAt:value?.parsedAt||null,
    firstSeenAt:value?.firstSeenAt||value?.parsedAt||null,
    lastUsedAt:value?.lastUsedAt||value?.parsedAt||null,
    source:String(value?.source||'library')
  };
}
function normalizeLibrary(value={}){
  const entries={};
  for(const [key,row] of Object.entries(value?.entries||{})){
    const item=normalizeEntry(key,row);
    if(item)entries[item.md5]=item;
  }
  return {version:1,entries,updatedAt:value?.updatedAt||null};
}

export function seedMetadataLibraryFromCache(library,cache){
  const out=normalizeLibrary(library);
  for(const file of Object.values(cache?.files||{})){
    const md5=normalizeMd5(file?.parsedMd5||file?.md5);
    const current=Boolean(md5&&file?.parsed&&(!file?.md5||!file?.parsedMd5||normalizeMd5(file.md5)===normalizeMd5(file.parsedMd5))&&!file?.parseError);
    if(!current)continue;
    const old=out.entries[md5];
    out.entries[md5]={
      md5,
      size:normalizeSize(file?.size)||old?.size||0,
      parsed:cleanParsed(file.parsed),
      parsedAt:file.parsedAt||old?.parsedAt||null,
      firstSeenAt:old?.firstSeenAt||file.parsedAt||null,
      lastUsedAt:old?.lastUsedAt||file.parsedAt||null,
      source:old?.source||'v3-cache-migration'
    };
  }
  return out;
}

export function getParsedMetadataByMd5(library,md5,size=0){
  md5=normalizeMd5(md5);
  if(!md5)return null;
  const item=normalizeEntry(md5,library?.entries?.[md5]);
  if(!item)return null;
  const expectedSize=normalizeSize(size);
  if(item.size&&expectedSize&&item.size!==expectedSize)return null;
  return {...item,parsed:{...item.parsed}};
}

export function rememberParsedMetadata(library,{md5,size,parsed,parsedAt,source='range-parser'}={}){
  md5=normalizeMd5(md5);
  if(!md5||!validParsed(parsed))return library;
  const out=normalizeLibrary(library);
  const old=out.entries[md5];
  out.entries[md5]={
    md5,
    size:normalizeSize(size)||old?.size||0,
    parsed:cleanParsed(parsed),
    parsedAt:parsedAt||old?.parsedAt||new Date().toISOString(),
    firstSeenAt:old?.firstSeenAt||parsedAt||new Date().toISOString(),
    lastUsedAt:new Date().toISOString(),
    source:String(source||'range-parser')
  };
  return out;
}

export async function readIpaMetadataLibrary(){
  try{return normalizeLibrary(JSON.parse(await fs.readFile(IPA_METADATA_LIBRARY_FILE,'utf8')))}
  catch(e){if(e?.code==='ENOENT')return {version:1,entries:{},updatedAt:null};throw e}
}

export async function writeIpaMetadataLibrary(value){
  const normalized=normalizeLibrary({...value,updatedAt:new Date().toISOString()});
  normalized.updatedAt=new Date().toISOString();
  await fs.mkdir(path.dirname(IPA_METADATA_LIBRARY_FILE),{recursive:true,mode:0o750});
  const body=JSON.stringify(normalized,null,2)+'\n';
  writeQueue=writeQueue.then(async()=>{
    const tmp=`${IPA_METADATA_LIBRARY_FILE}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tmp,body,{mode:0o600});
    await fs.rename(tmp,IPA_METADATA_LIBRARY_FILE);
    await fs.chmod(IPA_METADATA_LIBRARY_FILE,0o600).catch(()=>{});
  });
  await writeQueue;
  return normalized;
}

export async function clearIpaMetadataLibrary(){
  return writeIpaMetadataLibrary({version:1,entries:{},updatedAt:null});
}

export async function loadAndSeedIpaMetadataLibrary(cache){
  const current=await readIpaMetadataLibrary();
  const seeded=seedMetadataLibraryFromCache(current,cache);
  const changed=JSON.stringify(seeded.entries)!==JSON.stringify(current.entries);
  return changed?writeIpaMetadataLibrary(seeded):seeded;
}

export { normalizeMd5 };