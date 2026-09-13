import {
  getOpenListConfig,
  readOpenListDirectoryCache,writeOpenListDirectoryCache,
  readOpenListIpaCache,writeOpenListIpaCache,
  readOpenListTask
} from '../storage/controlStore.js';
import {
  getParsedMetadataByMd5,
  loadAndSeedIpaMetadataLibrary,
  normalizeMd5
} from './ipaMetadataLibrary.js';

let timer=null;
let running=false;
let lastConfigUpdatedAt=null;
let initialized=false;

export function hydrateIpaCacheByMd5(cache,library){
  const files={...(cache?.files||{})};
  let reused=0,changed=false;
  for(const [apiPath,file] of Object.entries(files)){
    if(!file||file.missing)continue;
    const md5=normalizeMd5(file.md5);
    if(!md5)continue;
    const currentParsed=Boolean(file.parsed&&normalizeMd5(file.parsedMd5||file.md5)===md5&&!file.parseError);
    if(currentParsed)continue;
    const saved=getParsedMetadataByMd5(library,md5,file.size);
    if(!saved)continue;
    files[apiPath]={
      ...file,
      parsed:{...saved.parsed},
      parsedMd5:md5,
      parsedAt:saved.parsedAt||file.parsedAt||new Date().toISOString(),
      parseError:'',
      nextParseAfter:null,
      metadataReusedByMd5:true
    };
    reused+=1;changed=true;
  }
  return {cache:{...cache,files},library,reused,changed};
}

async function clearDirectoryCache(){
  const current=await readOpenListDirectoryCache();
  if(current?.scopeKey||Object.keys(current?.directories||{}).length){
    await writeOpenListDirectoryCache({version:1,scopeKey:'',directories:{}});
    return true;
  }
  return false;
}

async function invalidateDirectoryCacheOnConfigChange(){
  const cfg=await getOpenListConfig();
  const marker=String(cfg?.updatedAt||'');
  if(!initialized){
    lastConfigUpdatedAt=marker;
    return clearDirectoryCache();
  }
  if(marker===lastConfigUpdatedAt)return false;
  lastConfigUpdatedAt=marker;
  return clearDirectoryCache();
}

export async function reconcileIpaMetadataPersistence(){
  if(running)return {busy:true};
  running=true;
  try{
    const task=await readOpenListTask();
    const directoryCacheInvalidated=await invalidateDirectoryCacheOnConfigChange();
    if(['queued','running'].includes(String(task?.state||'')))return {busy:true,directoryCacheInvalidated};
    const cache=await readOpenListIpaCache();
    const library=await loadAndSeedIpaMetadataLibrary(cache);
    const hydrated=hydrateIpaCacheByMd5(cache,library);
    if(hydrated.changed)await writeOpenListIpaCache(hydrated.cache);
    return {busy:false,reused:hydrated.reused,libraryEntries:Object.keys(library.entries||{}).length,directoryCacheInvalidated};
  }finally{running=false}
}

export async function startIpaMetadataPersistence(){
  if(timer)return;
  await reconcileIpaMetadataPersistence();
  initialized=true;
  // OpenList account/token/path changes are uncommon; a 1s guard keeps cache identity coherent without touching IPA bytes.
  timer=setInterval(()=>reconcileIpaMetadataPersistence().catch(e=>console.error('IPA metadata persistence:',e?.message||e)),1000);
  timer.unref?.();
}