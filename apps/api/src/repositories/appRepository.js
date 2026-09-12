import { AppError } from '../utils/http.js';
import { listMysqlSources, getMysqlSourceBySlug } from '../storage/controlStore.js';
import { fromHex, parseTsv, runMysql, safeIdentifier, sqlInt, sqlText } from '../services/mysqlCli.js';

function normalizePagination(page=1,pageSize=20){ page=Math.max(1,Number(page)||1); pageSize=Math.min(100,Math.max(1,Number(pageSize)||20)); return {page,pageSize,offset:(page-1)*pageSize}; }
function sourceView(s){ return {id:s.id,name:s.name,slug:s.slug,enabled:s.enabled!==false,priority:Number(s.priority||100),config:s.config}; }
function epochIso(v){ const n=Number(v||0); return n>0?new Date(n*1000).toISOString():null; }
function appKey(source,rowId){ return `${source.slug}:${rowId}`; }
function versionKey(source,rowId){ return `${source.slug}:${rowId}:current`; }
function numericSize(v){ const n=Number(String(v??'').trim()); return Number.isFinite(n)&&n>=0?Math.round(n):null; }
function normalStatus(v){ return ['normal','published','1','active'].includes(String(v||'').toLowerCase()); }

function mapRow(source,cols){
  const [id,nameHex,nicknameHex,imageHex,keywordsHex,descriptionHex,createtime,updatetime,weigh,statusHex,bt1aHex,bt2aHex,cs]=cols;
  const status=fromHex(statusHex);
  if(!normalStatus(status)) return null;
  const legacyId=Number(id);
  const name=fromHex(nameHex).trim();
  const version=fromHex(nicknameHex).trim();
  const keywords=fromHex(keywordsHex).trim();
  const description=fromHex(descriptionHex).trim();
  const icon=fromHex(imageHex).trim();
  const target=fromHex(bt1aHex).trim();
  const size=numericSize(fromHex(bt2aHex));
  const key=appKey(source,legacyId);
  const updatedEpoch=Number(updatetime||createtime||0);
  return {
    id:key,
    slug:key,
    legacy_id:legacyId,
    source_id:source.id,
    source_name:source.name,
    source_slug:source.slug,
    category_id:source.id,
    category_name:source.name,
    category_slug:source.slug,
    name:name||`App ${legacyId}`,
    bundle_id:'',
    icon_url:icon||null,
    short_description:keywords||description||'',
    description:description||keywords||'',
    developer:'',
    status:'published',
    featured:Number(weigh||0)>=1000,
    hot:Number(cs||0)>0,
    sort_order:Number(weigh||0),
    download_count:Number(cs||0),
    version_id:versionKey(source,legacyId),
    version:version||'',
    build:'',
    file_size:size,
    min_ios:null,
    release_date:epochIso(updatetime||createtime),
    changelog:keywords||'',
    created_at:epochIso(createtime),
    updated_at:epochIso(updatetime||createtime),
    _updatedEpoch:updatedEpoch,
    _downloadTarget:target,
    tags:[],
    screenshots:[]
  };
}

function selectColumns(table){
  return `SELECT id,HEX(name),HEX(nickname),HEX(image),HEX(keywords),HEX(description),createtime,updatetime,weigh,HEX(status),HEX(bt1a),HEX(bt2a),cs FROM ${table}`;
}
function visibleWhere(q=''){
  const parts=["status IN ('normal','published','1','active')"];
  if(q){ const like=sqlText(`%${q}%`); parts.push(`(name LIKE ${like} OR nickname LIKE ${like} OR keywords LIKE ${like} OR description LIKE ${like} OR bt1a LIKE ${like})`); }
  return `WHERE ${parts.join(' AND ')}`;
}
function sqlOrder(sort){
  if(sort==='downloads') return 'cs DESC,id DESC';
  if(sort==='name') return 'name ASC,id ASC';
  if(sort==='oldest') return 'COALESCE(updatetime,createtime,0) ASC,id ASC';
  if(sort==='weight') return 'weigh DESC,COALESCE(updatetime,createtime,0) DESC,id DESC';
  return 'COALESCE(updatetime,createtime,0) DESC,id DESC';
}
function jsSort(sort){
  return (a,b)=>{
    if(sort==='downloads') return (b.download_count-a.download_count)||(b.legacy_id-a.legacy_id);
    if(sort==='name') return a.name.localeCompare(b.name,'zh-CN')||(a.legacy_id-b.legacy_id);
    if(sort==='oldest') return (a._updatedEpoch-b._updatedEpoch)||(a.legacy_id-b.legacy_id);
    if(sort==='weight') return (b.sort_order-a.sort_order)||(b._updatedEpoch-a._updatedEpoch)||(b.legacy_id-a.legacy_id);
    return (b._updatedEpoch-a._updatedEpoch)||(b.legacy_id-a.legacy_id);
  };
}

async function enabledSources(filterSlug){
  const all=(await listMysqlSources({withSecrets:true})).map(sourceView).filter(x=>x.enabled);
  return filterSlug?all.filter(x=>x.slug===filterSlug):all;
}

async function querySourceApps(source,{q='',sort='updated',candidateLimit=100}){
  const table=safeIdentifier(source.config.table||'fa_category');
  const countSql=`SELECT COUNT(*) FROM ${table} ${visibleWhere(q)}`;
  const rowsSql=`${selectColumns(table)} ${visibleWhere(q)} ORDER BY ${sqlOrder(sort)} LIMIT ${sqlInt(candidateLimit,100)}`;
  const [countOut,rowsOut]=await Promise.all([runMysql(source.config,countSql),runMysql(source.config,rowsSql)]);
  const count=Number(parseTsv(countOut)?.[0]?.[0]||0);
  const items=parseTsv(rowsOut).map(cols=>mapRow(source,cols)).filter(Boolean);
  return {count,items};
}

export async function listApps({q='',category,source,sort='updated',page=1,pageSize=20}={}) {
  const p=normalizePagination(page,pageSize);
  const filterSlug=source||category||'';
  const sources=await enabledSources(filterSlug);
  if(!sources.length) return {items:[],total:0,...p,sourceErrors:[]};
  const candidateLimit=Math.min(5000,Math.max(p.pageSize,p.page*p.pageSize));
  const settled=await Promise.allSettled(sources.map(s=>querySourceApps(s,{q:String(q||'').trim(),sort,candidateLimit})));
  let total=0; const items=[]; const sourceErrors=[];
  settled.forEach((r,i)=>{ if(r.status==='fulfilled'){total+=r.value.count;items.push(...r.value.items)} else sourceErrors.push({source:sources[i].slug,message:r.reason?.message||'查询失败'}) });
  if(settled.every(x=>x.status==='rejected')) throw new AppError(503,'MYSQL_SOURCES_UNAVAILABLE','所有 MySQL 软件源均不可用',sourceErrors);
  items.sort(jsSort(sort));
  const sliced=items.slice(p.offset,p.offset+p.pageSize).map(({_updatedEpoch,_downloadTarget,...x})=>x);
  return {items:sliced,total,...p,sourceErrors};
}

function parseComposite(id){
  const m=/^([a-z0-9_-]+):(\d+)(?::current)?$/i.exec(String(id||''));
  return m?{slug:m[1],id:Number(m[2])}:null;
}

async function rawApp(source,legacyId){
  const table=safeIdentifier(source.config.table||'fa_category');
  const sql=`${selectColumns(table)} WHERE id=${sqlInt(legacyId)} LIMIT 1`;
  const rows=parseTsv(await runMysql(source.config,sql));
  return rows.length?mapRow(source,rows[0]):null;
}

export async function getApp(idOrSlug,publishedOnly=true) {
  const parsed=parseComposite(idOrSlug);
  if(parsed){
    const row=await getMysqlSourceBySlug(parsed.slug,{withSecrets:true});
    if(!row||row.enabled===false) return null;
    const app=await rawApp(sourceView(row),parsed.id);
    if(!app || (publishedOnly&&app.status!=='published')) return null;
    const {_updatedEpoch,_downloadTarget,...publicApp}=app; return publicApp;
  }
  if(/^\d+$/.test(String(idOrSlug))){
    const sources=await enabledSources(); if(sources.length===1){ const app=await rawApp(sources[0],Number(idOrSlug)); if(app){const {_updatedEpoch,_downloadTarget,...publicApp}=app;return publicApp;} }
  }
  return null;
}

export async function getAppWithTarget(idOrSlug){
  const parsed=parseComposite(idOrSlug); if(!parsed)return null;
  const row=await getMysqlSourceBySlug(parsed.slug,{withSecrets:true}); if(!row||row.enabled===false)return null;
  return rawApp(sourceView(row),parsed.id);
}

export async function listVersions(appId,_includeDraft=false) {
  const app=await getAppWithTarget(appId); if(!app)return [];
  return [{id:app.version_id,app_id:app.id,version:app.version||'',build:'',file_size:app.file_size,min_ios:null,changelog:app.changelog||'',status:'published',release_date:app.release_date||app.updated_at||new Date().toISOString(),download_count:app.download_count}];
}

export async function incrementLegacyDownload(app){
  if(!app?.source_slug||!app?.legacy_id)return false;
  const row=await getMysqlSourceBySlug(app.source_slug,{withSecrets:true}); if(!row||row.enabled===false||row.config?.writeStats!==true)return false;
  const table=safeIdentifier(row.config.table||'fa_category');
  await runMysql(row.config,`UPDATE ${table} SET cs=COALESCE(cs,0)+1,cstime=UNIX_TIMESTAMP() WHERE id=${sqlInt(app.legacy_id)}`);
  return true;
}

export async function sourceStatistics(){
  const sources=await enabledSources();
  const settled=await Promise.allSettled(sources.map(async s=>{
    const table=safeIdentifier(s.config.table||'fa_category');
    const out=await runMysql(s.config,`SELECT COUNT(*),COALESCE(SUM(cs),0) FROM ${table} WHERE status IN ('normal','published','1','active')`);
    const row=parseTsv(out)?.[0]||['0','0']; return {source:s,count:Number(row[0]||0),downloads:Number(row[1]||0)};
  }));
  return settled.filter(x=>x.status==='fulfilled').map(x=>x.value);
}

// Legacy write APIs are intentionally disabled: apps stay in their original MySQL software source.
function readonly(){ throw new AppError(405,'SOURCE_MANAGED','应用由原 MySQL 软件源管理，新站不会复制或重新上传 IPA'); }
export const createApp=readonly, updateApp=readonly, deleteApp=readonly, createVersion=readonly, updateVersion=readonly, deleteVersion=readonly, replaceVersionSources=readonly;
export async function getVersionSources(){ return []; }
