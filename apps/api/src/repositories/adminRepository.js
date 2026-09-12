import { query } from '../db/pool.js';
export async function findAdmin(username){ const r=await query("SELECT * FROM admins WHERE username=$1 AND status='active'",[username]); return r.rows[0]||null; }
export async function touchLogin(id){ await query('UPDATE admins SET last_login_at=NOW() WHERE id=$1',[id]); }
export async function listCategories(){ return (await query('SELECT * FROM categories ORDER BY sort_order DESC,id')).rows; }
export async function createCategory(d){ return (await query('INSERT INTO categories(name,slug,sort_order,enabled) VALUES($1,$2,$3,$4) RETURNING *',[d.name,d.slug,d.sortOrder||0,d.enabled!==false])).rows[0]; }
export async function updateCategory(id,d){ return (await query('UPDATE categories SET name=COALESCE($1,name),slug=COALESCE($2,slug),sort_order=COALESCE($3,sort_order),enabled=COALESCE($4,enabled),updated_at=NOW() WHERE id=$5 RETURNING *',[d.name??null,d.slug??null,d.sortOrder??null,d.enabled??null,id])).rows[0]||null; }
export async function deleteCategory(id){ return !!(await query('DELETE FROM categories WHERE id=$1 RETURNING id',[id])).rowCount; }
export async function listTags(){ return (await query('SELECT * FROM tags ORDER BY name')).rows; }
export async function createTag(d){ return (await query('INSERT INTO tags(name,slug) VALUES($1,$2) RETURNING *',[d.name,d.slug])).rows[0]; }
export async function deleteTag(id){ return !!(await query('DELETE FROM tags WHERE id=$1 RETURNING id',[id])).rowCount; }
export async function listSources(){ return (await query('SELECT id,name,type,base_url,enabled,priority,health_status,last_checked_at,created_at,updated_at FROM download_sources ORDER BY priority,id')).rows; }
export async function getSource(id){ return (await query('SELECT * FROM download_sources WHERE id=$1',[id])).rows[0]||null; }
export async function createSource(d){ return (await query('INSERT INTO download_sources(name,type,base_url,config_encrypted,enabled,priority) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,name,type,base_url,enabled,priority,health_status,created_at',[d.name,d.type,d.baseUrl||null,d.configEncrypted||null,d.enabled!==false,d.priority||100])).rows[0]; }
export async function updateSource(id,d){ return (await query('UPDATE download_sources SET name=COALESCE($1,name),type=COALESCE($2,type),base_url=$3,config_encrypted=COALESCE($4,config_encrypted),enabled=COALESCE($5,enabled),priority=COALESCE($6,priority),updated_at=NOW() WHERE id=$7 RETURNING id,name,type,base_url,enabled,priority,health_status,updated_at',[d.name??null,d.type??null,d.baseUrl??null,d.configEncrypted??null,d.enabled??null,d.priority??null,id])).rows[0]||null; }
export async function deleteSource(id){ return !!(await query('DELETE FROM download_sources WHERE id=$1 RETURNING id',[id])).rowCount; }
export async function getSettings(publicOnly=false){ const r=await query(`SELECT key,value,is_public,updated_at FROM settings ${publicOnly?'WHERE is_public=TRUE':''} ORDER BY key`); return Object.fromEntries(r.rows.map(x=>[x.key,x.value])); }
export async function setSetting(key,value,isPublic=false){ await query(`INSERT INTO settings(key,value,is_public,updated_at) VALUES($1,$2::jsonb,$3,NOW()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,is_public=EXCLUDED.is_public,updated_at=NOW()`,[key,JSON.stringify(value),isPublic]); }
export async function statistics(){
  const [apps,versions,today,total,hot,recent]=await Promise.all([
    query("SELECT COUNT(*)::int n FROM apps WHERE status='published'"),query("SELECT COUNT(*)::int n FROM app_versions WHERE status='published'"),
    query("SELECT COUNT(*)::int n FROM downloads WHERE created_at>=date_trunc('day',NOW())"),query('SELECT COUNT(*)::bigint n FROM downloads'),
    query("SELECT id,name,slug,download_count FROM apps WHERE status='published' ORDER BY download_count DESC LIMIT 10"),
    query(`SELECT d.id,d.created_at,d.status,a.name,v.version,ds.name AS source_name FROM downloads d JOIN apps a ON a.id=d.app_id JOIN app_versions v ON v.id=d.version_id LEFT JOIN download_sources ds ON ds.id=d.source_id ORDER BY d.created_at DESC LIMIT 20`)
  ]);
  return {totalApps:apps.rows[0].n,totalVersions:versions.rows[0].n,todayDownloads:today.rows[0].n,totalDownloads:Number(total.rows[0].n),hotApps:hot.rows,recentDownloads:recent.rows};
}
