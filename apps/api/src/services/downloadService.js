import { query, tx } from '../db/pool.js';
import { getVersionSources } from '../repositories/appRepository.js';
import { resolveBinding } from '../storage/adapters.js';
import { hashIp } from '../utils/crypto.js';
import { AppError } from '../utils/http.js';

export async function resolveDownload({appId,versionId,ip,userAgent,referer}) {
  const ar=await query("SELECT id,current_version_id,status FROM apps WHERE id=$1",[appId]);
  if(!ar.rowCount || ar.rows[0].status!=='published') throw new AppError(404,'APP_NOT_FOUND','应用不存在或未上架');
  const selectedVersionId=versionId || ar.rows[0].current_version_id;
  if(!selectedVersionId) throw new AppError(404,'VERSION_NOT_FOUND','当前没有可下载版本');
  const vr=await query("SELECT * FROM app_versions WHERE id=$1 AND app_id=$2 AND status='published'",[selectedVersionId,appId]);
  if(!vr.rowCount) throw new AppError(404,'VERSION_NOT_FOUND','版本不存在或不可下载');
  const bindings=await getVersionSources(selectedVersionId);
  let resolved=null;
  for(const binding of bindings){ try { resolved=resolveBinding(binding); if(resolved?.url) break; } catch(e){ console.warn('download source skipped',binding.id,e.message); } }
  if(!resolved) throw new AppError(503,'DOWNLOAD_SOURCE_UNAVAILABLE','当前没有可用下载源');
  await tx(async c=>{
    await c.query(`INSERT INTO downloads(app_id,version_id,source_id,ip_hash,user_agent,referer,status) VALUES($1,$2,$3,$4,$5,$6,'redirected')`,[appId,selectedVersionId,resolved.sourceId,hashIp(ip),String(userAgent||'').slice(0,1000),String(referer||'').slice(0,2000)]);
    await c.query('UPDATE apps SET download_count=download_count+1 WHERE id=$1',[appId]);
    await c.query('UPDATE app_versions SET download_count=download_count+1 WHERE id=$1',[selectedVersionId]);
  });
  return {...resolved,version:vr.rows[0]};
}
