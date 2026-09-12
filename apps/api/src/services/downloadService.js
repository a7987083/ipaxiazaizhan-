import { appendDownloadEvent } from '../storage/controlStore.js';
import { getAppWithTarget, incrementLegacyDownload } from '../repositories/appRepository.js';
import { hashIp } from '../utils/crypto.js';
import { AppError } from '../utils/http.js';

function validTarget(target){
  const s=String(target||'').trim();
  if(!/^[a-z][a-z0-9+.-]*:/i.test(s)) return false;
  return !/^(javascript|data|file):/i.test(s);
}

export async function resolveDownload({appId,versionId,ip,userAgent,referer}) {
  const app=await getAppWithTarget(appId);
  if(!app || app.status!=='published') throw new AppError(404,'APP_NOT_FOUND','应用不存在或未上架');
  if(versionId && String(versionId)!==String(app.version_id)) throw new AppError(404,'VERSION_NOT_FOUND','版本不存在或不可下载');
  if(!validTarget(app._downloadTarget)) throw new AppError(503,'DOWNLOAD_SOURCE_UNAVAILABLE','该软件源没有可用下载地址');
  await appendDownloadEvent({at:new Date().toISOString(),appId:app.id,source:app.source_slug,legacyId:app.legacy_id,ipHash:hashIp(ip),userAgent:String(userAgent||'').slice(0,500),referer:String(referer||'').slice(0,1000)}).catch(()=>{});
  await incrementLegacyDownload(app).catch(e=>console.warn('legacy download counter skipped',e.message));
  return {url:app._downloadTarget,version:{id:app.version_id,version:app.version,file_size:app.file_size},sourceId:app.source_id};
}
