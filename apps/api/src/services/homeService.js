import { listApps } from '../repositories/appRepository.js';
import { query } from '../db/pool.js';
export async function getHome(){
  const [featured,latest,hot,cats,settings]=await Promise.all([
    query(`SELECT a.id,a.name,a.slug,a.bundle_id,a.icon_url,a.short_description,a.download_count,v.version,v.file_size,v.release_date FROM apps a LEFT JOIN app_versions v ON v.id=a.current_version_id WHERE a.status='published' AND a.featured=TRUE ORDER BY a.sort_order DESC,a.updated_at DESC LIMIT 12`),
    listApps({sort:'updated',page:1,pageSize:12}),listApps({sort:'downloads',page:1,pageSize:12}),
    query('SELECT id,name,slug,sort_order FROM categories WHERE enabled=TRUE ORDER BY sort_order DESC,id'),
    query('SELECT key,value FROM settings WHERE is_public=TRUE')
  ]);
  return {featured:featured.rows,latest:latest.items,hot:hot.items,categories:cats.rows,settings:Object.fromEntries(settings.rows.map(x=>[x.key,x.value]))};
}
