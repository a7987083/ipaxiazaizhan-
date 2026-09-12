import { query, tx } from '../db/pool.js';

function normalizePagination(page=1,pageSize=20){ page=Math.max(1,Number(page)||1); pageSize=Math.min(100,Math.max(1,Number(pageSize)||20)); return {page,pageSize,offset:(page-1)*pageSize}; }

export async function listApps({q,category,tag,sort='updated',page=1,pageSize=20,status='published'}={}) {
  const p=normalizePagination(page,pageSize); const where=[]; const params=[];
  if(status){ params.push(status); where.push(`a.status=$${params.length}`); }
  if(q){ params.push(`%${q}%`); where.push(`(a.name ILIKE $${params.length} OR a.bundle_id ILIKE $${params.length} OR a.developer ILIKE $${params.length})`); }
  if(category){ params.push(category); where.push(`c.slug=$${params.length}`); }
  if(tag){ params.push(tag); where.push(`EXISTS (SELECT 1 FROM app_tags ax JOIN tags t ON t.id=ax.tag_id WHERE ax.app_id=a.id AND t.slug=$${params.length})`); }
  const order = sort==='downloads' ? 'a.download_count DESC,a.id DESC' : sort==='name' ? 'a.name ASC,a.id DESC' : sort==='oldest' ? 'a.updated_at ASC,a.id ASC' : 'a.updated_at DESC,a.id DESC';
  const whereSql=where.length?`WHERE ${where.join(' AND ')}`:'';
  const countParams=[...params];
  const count=await query(`SELECT COUNT(DISTINCT a.id)::int AS n FROM apps a LEFT JOIN categories c ON c.id=a.category_id ${whereSql}`,countParams);
  params.push(p.pageSize,p.offset);
  const rows=await query(`SELECT a.*,c.name AS category_name,c.slug AS category_slug,
      v.id AS version_id,v.version,v.build,v.file_size,v.min_ios,v.release_date,v.changelog
    FROM apps a LEFT JOIN categories c ON c.id=a.category_id
    LEFT JOIN app_versions v ON v.id=a.current_version_id
    ${whereSql} ORDER BY ${order} LIMIT $${params.length-1} OFFSET $${params.length}`,params);
  return {items:rows.rows,total:count.rows[0].n,...p};
}

export async function getApp(idOrSlug, publishedOnly=true) {
  const numeric=/^\d+$/.test(String(idOrSlug));
  const params=[numeric?Number(idOrSlug):String(idOrSlug)];
  const where=numeric?'a.id=$1':'a.slug=$1';
  const r=await query(`SELECT a.*,c.name AS category_name,c.slug AS category_slug,
    v.id AS version_id,v.version,v.build,v.file_size,v.min_ios,v.release_date,v.changelog
    FROM apps a LEFT JOIN categories c ON c.id=a.category_id LEFT JOIN app_versions v ON v.id=a.current_version_id
    WHERE ${where} ${publishedOnly?"AND a.status='published'":''} LIMIT 1`,params);
  if(!r.rowCount) return null;
  const app=r.rows[0];
  const [tags,screenshots]=await Promise.all([
    query('SELECT t.id,t.name,t.slug FROM tags t JOIN app_tags at ON at.tag_id=t.id WHERE at.app_id=$1 ORDER BY t.name',[app.id]),
    query('SELECT id,url,sort_order FROM screenshots WHERE app_id=$1 ORDER BY sort_order,id',[app.id])
  ]);
  return {...app,tags:tags.rows,screenshots:screenshots.rows};
}

export async function listVersions(appId, includeDraft=false) {
  const r=await query(`SELECT * FROM app_versions WHERE app_id=$1 ${includeDraft?'':"AND status='published'"} ORDER BY release_date DESC,id DESC`,[appId]);
  return r.rows;
}

export async function createApp(data) {
  return tx(async c=>{
    const status=data.status||'draft';
    const publishedAt=status==='published' ? new Date() : null;
    const r=await c.query(`INSERT INTO apps(name,slug,bundle_id,icon_url,short_description,description,developer,category_id,status,featured,hot,sort_order,published_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [data.name,data.slug,data.bundleId,data.iconUrl||null,data.shortDescription||null,data.description||null,data.developer||null,data.categoryId||null,status,!!data.featured,!!data.hot,data.sortOrder||0,publishedAt]);
    if(data.tagIds?.length) await setTagsWithClient(c,r.rows[0].id,data.tagIds);
    if(data.screenshots?.length) await replaceScreenshotsWithClient(c,r.rows[0].id,data.screenshots);
    return r.rows[0];
  });
}

export async function updateApp(id,data) {
  return tx(async c=>{
    const fields=[]; const values=[]; const map={name:'name',slug:'slug',bundleId:'bundle_id',iconUrl:'icon_url',shortDescription:'short_description',description:'description',developer:'developer',categoryId:'category_id',status:'status',featured:'featured',hot:'hot',sortOrder:'sort_order'};
    for(const [k,col] of Object.entries(map)) if(Object.hasOwn(data,k)){ values.push(data[k]); fields.push(`${col}=$${values.length}`); }
    if(Object.hasOwn(data,'status') && data.status==='published') fields.push(`published_at=COALESCE(published_at,NOW())`);
    fields.push('updated_at=NOW()'); values.push(id);
    const r=await c.query(`UPDATE apps SET ${fields.join(',')} WHERE id=$${values.length} RETURNING *`,values);
    if(!r.rowCount) return null;
    if(data.tagIds) await setTagsWithClient(c,id,data.tagIds);
    if(data.screenshots) await replaceScreenshotsWithClient(c,id,data.screenshots);
    return r.rows[0];
  });
}

async function setTagsWithClient(c,appId,tagIds){ await c.query('DELETE FROM app_tags WHERE app_id=$1',[appId]); for(const tagId of tagIds) await c.query('INSERT INTO app_tags(app_id,tag_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[appId,tagId]); }
async function replaceScreenshotsWithClient(c,appId,urls){ await c.query('DELETE FROM screenshots WHERE app_id=$1',[appId]); let i=0; for(const url of urls) await c.query('INSERT INTO screenshots(app_id,url,sort_order) VALUES($1,$2,$3)',[appId,url,i++]); }

export async function deleteApp(id){ const r=await query('DELETE FROM apps WHERE id=$1 RETURNING id',[id]); return !!r.rowCount; }

export async function createVersion(appId,data){
  return tx(async c=>{
    const r=await c.query(`INSERT INTO app_versions(app_id,version,build,file_size,min_ios,changelog,status,release_date)
      VALUES($1,$2,$3,$4,$5,$6,$7,COALESCE($8,NOW())) RETURNING *`,[appId,data.version,data.build||'',data.fileSize||null,data.minIos||null,data.changelog||null,data.status||'published',data.releaseDate||null]);
    if(data.setCurrent!==false) await c.query('UPDATE apps SET current_version_id=$1,updated_at=NOW() WHERE id=$2',[r.rows[0].id,appId]);
    if(data.sources?.length) for(const s of data.sources) await c.query(`INSERT INTO version_download_sources(version_id,source_id,target,priority,enabled,meta) VALUES($1,$2,$3,$4,$5,$6::jsonb)`,[r.rows[0].id,s.sourceId,s.target,s.priority||100,s.enabled!==false,JSON.stringify(s.meta||{})]);
    return r.rows[0];
  });
}

export async function updateVersion(id,data){
  const fields=[]; const values=[]; const map={version:'version',build:'build',fileSize:'file_size',minIos:'min_ios',changelog:'changelog',status:'status',releaseDate:'release_date'};
  for(const [k,col] of Object.entries(map)) if(Object.hasOwn(data,k)){ values.push(data[k]); fields.push(`${col}=$${values.length}`); }
  fields.push('updated_at=NOW()'); values.push(id);
  const r=await query(`UPDATE app_versions SET ${fields.join(',')} WHERE id=$${values.length} RETURNING *`,values); return r.rows[0]||null;
}
export async function deleteVersion(id){ return tx(async c=>{ const vr=await c.query('SELECT app_id FROM app_versions WHERE id=$1',[id]); if(!vr.rowCount) return false; await c.query('UPDATE apps SET current_version_id=NULL WHERE current_version_id=$1',[id]); await c.query('DELETE FROM app_versions WHERE id=$1',[id]); const latest=await c.query("SELECT id FROM app_versions WHERE app_id=$1 AND status='published' ORDER BY release_date DESC,id DESC LIMIT 1",[vr.rows[0].app_id]); if(latest.rowCount) await c.query('UPDATE apps SET current_version_id=$1 WHERE id=$2',[latest.rows[0].id,vr.rows[0].app_id]); return true; }); }

export async function replaceVersionSources(versionId,sources){ return tx(async c=>{ await c.query('DELETE FROM version_download_sources WHERE version_id=$1',[versionId]); for(const s of sources) await c.query(`INSERT INTO version_download_sources(version_id,source_id,target,priority,enabled,meta) VALUES($1,$2,$3,$4,$5,$6::jsonb)`,[versionId,s.sourceId,s.target,s.priority||100,s.enabled!==false,JSON.stringify(s.meta||{})]); }); }
export async function getVersionSources(versionId){ const r=await query(`SELECT vds.*,ds.name AS source_name,ds.type,ds.base_url,ds.config_encrypted,ds.priority AS source_priority FROM version_download_sources vds JOIN download_sources ds ON ds.id=vds.source_id WHERE vds.version_id=$1 AND vds.enabled=TRUE AND ds.enabled=TRUE ORDER BY vds.priority ASC,ds.priority ASC,vds.id ASC`,[versionId]); return r.rows; }
