import fs from 'node:fs/promises';
import {
  IPA_CACHE_FILE, OPENLIST_DIR_CACHE_FILE, OPENLIST_TASK_FILE,
  readOpenListIpaCache, writeOpenListIpaCache,
  readOpenListDirectoryCache, writeOpenListDirectoryCache,
  readOpenListTask
} from '../storage/controlStore.js';

async function fileStat(file){
  try{const s=await fs.stat(file);return {bytes:Number(s.size||0),updatedAt:s.mtime?.toISOString?.()||null}}
  catch(e){if(e?.code==='ENOENT')return {bytes:0,updatedAt:null};throw e}
}
export async function getLocalCacheStatus(){
  const [ipa,dirs,task,ipaStat,dirStat,taskStat]=await Promise.all([
    readOpenListIpaCache(),readOpenListDirectoryCache(),readOpenListTask(),
    fileStat(IPA_CACHE_FILE),fileStat(OPENLIST_DIR_CACHE_FILE),fileStat(OPENLIST_TASK_FILE)
  ]);
  const files=Object.values(ipa.files||{});
  const parsed=files.filter(x=>x?.parsed&&(!x?.md5||!x?.parsedMd5||x.parsedMd5===x.md5)&&!x?.parseError).length;
  const failed=files.filter(x=>x?.parseError).length;
  const pending=files.filter(x=>!x?.missing&&(!x?.parsed||(x?.md5&&x?.parsedMd5!==x?.md5))).length;
  return {
    ipa:{...ipaStat,files:files.length,parsed,pending,failed,apps:Object.keys(ipa.appRefs||ipa.apps||{}).length,lastSync:ipa.lastSync||null},
    directory:{...dirStat,directories:Object.keys(dirs.directories||{}).length,scopeKey:dirs.scopeKey||''},
    task:{...taskStat,state:task?.state||'idle',stage:task?.stage||'idle',updatedAt:task?.updatedAt||taskStat.updatedAt},
    totalBytes:Number(ipaStat.bytes||0)+Number(dirStat.bytes||0)+Number(taskStat.bytes||0)
  };
}
function assertIdle(task){
  if(['queued','running'].includes(String(task?.state||'')))throw Object.assign(new Error('OpenList 后台任务运行中，完成后再清理缓存'),{code:'CACHE_TASK_BUSY'});
}
export async function clearLocalCache(target){
  target=String(target||'');
  if(!['directory','failed','ipa','all'].includes(target))throw Object.assign(new Error('未知缓存清理类型'),{code:'CACHE_TARGET_INVALID'});
  const task=await readOpenListTask();
  assertIdle(task);
  if(target==='directory'||target==='all'){
    await writeOpenListDirectoryCache({version:1,scopeKey:'',directories:{}});
  }
  if(target==='ipa'||target==='all'){
    await writeOpenListIpaCache({version:3,files:{},apps:{},appRefs:{},missingEntries:[],lastSync:null});
  }else if(target==='failed'){
    const cache=await readOpenListIpaCache();
    let reset=0;
    for(const file of Object.values(cache.files||{})){
      if(!file?.parseError)continue;
      file.parseError='';
      file.nextParseAfter=null;
      file.lastParseAttemptAt=null;
      reset+=1;
    }
    await writeOpenListIpaCache(cache);
    return {...await getLocalCacheStatus(),resetFailed:reset};
  }
  return getLocalCacheStatus();
}
