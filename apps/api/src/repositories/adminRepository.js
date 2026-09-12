import { countTodayDownloads, createMysqlSource, deleteMysqlSource, getAdminById, getAdminByUsername, getSettings as readSettings, listMysqlSources, setSetting as writeSetting, touchAdminLogin, updateMysqlSource } from '../storage/controlStore.js';
import { listApps, sourceStatistics } from './appRepository.js';

export async function findAdmin(username){ return getAdminByUsername(username); }
export async function findAdminById(id){ return getAdminById(id); }
export async function touchLogin(id){ return touchAdminLogin(id); }

export async function listCategories(){
  return (await listMysqlSources()).filter(x=>x.enabled).sort((a,b)=>a.priority-b.priority||a.id-b.id).map(x=>({id:x.id,name:x.name,slug:x.slug,sort_order:100000-x.priority,enabled:x.enabled}));
}
export async function createCategory(){ throw Object.assign(new Error('分类由 MySQL 软件源自动生成'),{status:405,code:'SOURCE_MANAGED'}); }
export async function updateCategory(){ throw Object.assign(new Error('分类由 MySQL 软件源自动生成'),{status:405,code:'SOURCE_MANAGED'}); }
export async function deleteCategory(){ throw Object.assign(new Error('分类由 MySQL 软件源自动生成'),{status:405,code:'SOURCE_MANAGED'}); }
export async function listTags(){ return []; }
export async function createTag(){ throw Object.assign(new Error('当前版本不维护独立标签库'),{status:405,code:'SOURCE_MANAGED'}); }
export async function deleteTag(){ return false; }

export async function listSources(){ return (await listMysqlSources()).sort((a,b)=>a.priority-b.priority||a.id-b.id); }
export async function createSource(d){ return createMysqlSource(d); }
export async function updateSource(id,d){ return updateMysqlSource(id,d); }
export async function deleteSource(id){ return deleteMysqlSource(id); }

export async function getSettings(_publicOnly=false){ return readSettings(); }
export async function setSetting(key,value,_isPublic=false){ await writeSetting(key,value); }

export async function statistics(){
  const [stats,hot,today]=await Promise.all([
    sourceStatistics(),
    listApps({sort:'downloads',page:1,pageSize:10}),
    countTodayDownloads()
  ]);
  const totalApps=stats.reduce((n,x)=>n+x.count,0);
  const totalDownloads=stats.reduce((n,x)=>n+x.downloads,0);
  return {
    totalApps,
    totalVersions:totalApps,
    todayDownloads:today,
    totalDownloads,
    totalSources:stats.length,
    hotApps:hot.items,
    recentDownloads:[]
  };
}
