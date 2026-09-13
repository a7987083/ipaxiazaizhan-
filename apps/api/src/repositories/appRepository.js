import { AppError } from '../utils/http.js';
import { listMysqlSources, getMysqlSourceBySlug, readOpenListIpaCache } from '../storage/controlStore.js';
import { fromHex, parseTsv, runMysql, safeIdentifier, sqlInt, sqlText } from '../services/mysqlCli.js';

function normalizePagination(page=1,pageSize=20){ page=Math.max(1,Number(page)||1); pageSize=Math.min(100,Math.max(1,Number(pageSize)||20)); return {page,pageSize,offset:(page-1)*pageSize}; }
function sourceView(s){ return {id:s.id,name:s.name,slug:s.slug,enabled:s.enabled!==false,priority:Number(s.priority||100),config:s.config}; }
function epochIso(v){ const n=Number(v||0); return n>0?new Date(n*1000).toISOString():null; }
function appKey(source,rowId){ return `${source.slug}:${rowId}`; }
function versionKey(source,rowId){ return `${source.slug}:${rowId}:current`; }
function numericSize(v){ const n=Number(String(v??'').trim()); return Number.isFinite(n)&&n>=0?Math.round(n):null; }
function normalStatus(v){ return ['normal','published','1','active'].includes(String(v||'').toLowerCase()); }
function normalizeIpaFilter(v){ return ['parsed','pending','failed'].includes(String(v||'').toLowerCase())?String(v).toLowerCase():'all'; }
function normalizeIosTarget(v){ const s=String(v??'').trim(); return /^\d{1,2}(?:\.\d{1,2}){0,2}$/.test(s)?s:''; }
function versionParts(v){ return String(v||'').split('.').map(x=>Number.parseInt(x,10)).map(x=>Number.isFinite(x)?x:0); }
export function compareNumericVersions(a,b){ const aa=versionParts(a),bb=versionParts(b),n=Math.max(aa.length,bb.length); for(let i=0;i<n;i++){ const d=(aa[i]||0)-(bb[i]||0); if(d)return d<0?-1:1; } return 0; }

function mapRow(source,cols){
  const [id,nameHex,nicknameHex,imageHex,keywordsHex,descriptionHex,createtime,updatetime,weigh,statusHex,bt2aHex,cs]=cols;
  const status=fromHex(statusHex);
  if(!normalStatus(status)) return null;
  const legacyId=Number(id);
  const name=fromHex(nameHex).trim();
  const version=fromHex(nicknameHex).trim();
  const keywords=fromHex(keywordsHex).trim();
  const description=fromHex(descriptionHex).trim();
  const icon=fromHex(imageHex).trim();
  const size=numericSize(fromHex(bt2aHex));
  const key=appKey(source,legacyId);
  const updatedEpoch=Number(updatetime||createtime||0);
  return {
    id:key,slug:key,legacy_id:legacyId,source_id:source.id,source_name:source.name,source_slug:source.slug,
    category_id:source.id,category_name:source.name,category_slug:source.slug,name:name||`App ${legacyId}`,
    bundle_id:'',icon_url:icon||null,short_description:keywords||description||'',description:description||keywords||'',developer:'',
    status:'published',featured:Number(weigh||0)>=1000,hot:Number(cs||0)>0,sort_order:Number(weigh||0),download_count:Number(cs||0),
    version_id:versionKey(source,legacyId),version:version||'',build:'',file_size:size,min_ios:null,
    release_date:epochIso(updatetime||createtime),changelog:keywords||'',created_at:epochIso(createtime),updated_at:epochIso(updatetime||createtime),
    _updatedEpoch:updatedEpoch,tags:[],screenshots:[]
  };
}

function parseComposite(id){
  const m=/^([a-z0-9_-]+):(\d+)(?::current)?$/i.exec(String(id||''));
  return m?{slug:m[1],id:Number(m[2])}:null;
}

function fileForApp(cache,appId){
  const apiPath=cache?.appRefs?.[appId]?.apiPath||cache?.apps?.[appId];
  const file=apiPath?cache?.files?.[apiPath]:null;
  return file&&!file.missing?file:null;
}

export function publicIpaMetadata(cache,appId){
  const file=fileForApp(cache,appId);
  if(!file) return {status:'unknown',verified:false,parsed:false};
  const currentParsed=Boolean(file.parsed&&(!file.md5||!file.parsedMd5||file.parsedMd5===file.md5));
  const status=file.parseError?'failed':currentParsed?'parsed':'pending';
  const meta=file.parsed||{};
  return {
    status,verified:Boolean(file.md5),parsed:currentParsed,parsedAt:file.parsedAt||null,modified:file.modified||null,
    fileSize:Number(file.size||0)||0,fileName:String(file.name||''),packageName:String(meta.name||''),
    packageVersion:String(meta.version||''),packageBuild:String(meta.build||''),bundleId:String(meta.bundle_id||''),
    minimumIos:String(meta.minimum_ios||''),executable:String(meta.executable||''),parseError:String(file.parseError||'')
  };
}

function enrichApp(app,cache){
  const ipa=publicIpaMetadata(cache,app.id);
  if(ipa.status==='unknown') return {...app,ipa_status:'unknown'};
  return {
    ...app,
    source_file_size:app.file_size,
    file_size:ipa.fileSize||app.file_size,
    bundle_id:ipa.bundleId||app.bundle_id,
    min_ios:ipa.minimumIos||app.min_ios,
    package_name:ipa.packageName,
    package_version:ipa.packageVersion,
    package_build:ipa.packageBuild,
    ipa_status:ipa.status,
    ipa_metadata:{verified:ipa.verified,parsed:ipa.parsed,parsed_at:ipa.parsedAt,modified:ipa.modified}
  };
}

async function readIpaCacheSafe(){ try{return await readOpenListIpaCache();}catch{return {apps:{},appRefs:{},files:{}};} }
async function enrichFromIpaCache(items,cache=null){ const c=cache||await readIpaCacheSafe(); return items.map(app=>enrichApp(app,c)); }

function publicCacheIndex(cache){
  const keys=new Set([...Object.keys(cache?.apps||{}),...Object.keys(cache?.appRefs||{})]);
  const out=[];
  for(const appId of keys){
    const parsed=parseComposite(appId); if(!parsed)continue;
    const ref=cache?.appRefs?.[appId]||{};
    const ipa=publicIpaMetadata(cache,appId);
    out.push({appId,sourceSlug:String(ref.sourceSlug||parsed.slug),legacyId:Number(ref.legacyId||parsed.id),ref,ipa});
  }
  return out;
}

function metadataSearchText(entry){
  const {appId,ref={},ipa={}}=entry;
  return [appId,ref.sourceSlug,ref.sourceName,ref.legacyId,ref.name,ref.version,ipa.fileName,ipa.packageName,ipa.packageVersion,ipa.packageBuild,ipa.bundleId,ipa.minimumIos,ipa.executable]
    .map(v=>String(v??'').toLowerCase()).join('\n');
}

export function filterPublicIpaIndex(index,{q='',ipa='all',ios=''}={}){
  const needle=String(q||'').trim().toLowerCase();
  const ipaFilter=normalizeIpaFilter(ipa);
  const iosTarget=normalizeIosTarget(ios);
  return index.filter(entry=>{
    if(ipaFilter!=='all'&&entry.ipa.status!==ipaFilter)return false;
    if(iosTarget){
      if(entry.ipa.status!=='parsed'||!normalizeIosTarget(entry.ipa.minimumIos))return false;
      if(compareNumericVersions(entry.ipa.minimumIos,iosTarget)>0)return false;
    }
    return !needle||metadataSearchText(entry).includes(needle);
  });
}

function idsBySource(entries){
  const m=new Map();
  for(const x of entries){ if(!m.has(x.sourceSlug))m.set(x.sourceSlug,new Set()); m.get(x.sourceSlug).add(Number(x.legacyId)); }
  return m;
}

function selectColumns(table){
  return `SELECT id,HEX(name),HEX(nickname),HEX(image),HEX(keywords),HEX(description),createtime,updatetime,weigh,HEX(status),HEX(bt2a),cs FROM ${table}`;
}
function idSql(ids){ const list=[...new Set((ids||[]).map(Number).filter(Number.isSafeInteger).filter(x=>x>0))]; return list.length?list.map(x=>sqlInt(x)).join(','):''; }
function textMatchSql(q=''){
  if(!q)return '';
  const like=sqlText(`%${q}%`);
  return `(name LIKE ${like} OR nickname LIKE ${like} OR keywords LIKE ${like} OR description LIKE ${like})`;
}
function visibleWhere(q='',{onlyIds=null,extraSearchIds=[]}={}){
  const parts=["status IN ('normal','published','1','active')"];
  if(Array.isArray(onlyIds)){
    const ids=idSql(onlyIds); if(!ids)return 'WHERE 1=0'; parts.push(`id IN (${ids})`);
  }
  if(q){
    const text=textMatchSql(q); const extra=idSql(extraSearchIds);
    parts.push(extra?`(${text} OR id IN (${extra}))`:text);
  }
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

async function querySourceApps(source,{q='',sort='updated',candidateLimit=100,onlyIds=null,extraSearchIds=[]}){
  const table=safeIdentifier(source.config.table||'fa_category');
  const where=visibleWhere(q,{onlyIds,extraSearchIds});
  const countSql=`SELECT COUNT(*) FROM ${table} ${where}`;
  const rowsSql=`${selectColumns(table)} ${where} ORDER BY ${sqlOrder(sort)} LIMIT ${sqlInt(candidateLimit,100)}`;
  const [countOut,rowsOut]=await Promise.all([runMysql(source.config,countSql),runMysql(source.config,rowsSql)]);
  const count=Number(parseTsv(countOut)?.[0]?.[0]||0);
  const items=parseTsv(rowsOut).map(cols=>mapRow(source,cols)).filter(Boolean);
  return {count,items};
}

export async function listApps({q='',category,source,sort='updated',page=1,pageSize=20,ipa='all',ios=''}={}) {
  const p=normalizePagination(page,pageSize);
  const filterSlug=source||category||'';
  const sources=await enabledSources(filterSlug);
  if(!sources.length) return {items:[],total:0,...p,sourceErrors:[]};

  const needle=String(q||'').trim();
  const ipaFilter=normalizeIpaFilter(ipa);
  const iosTarget=normalizeIosTarget(ios);
  const cache=await readIpaCacheSafe();
  const cacheIndex=publicCacheIndex(cache);
  const metadataMatches=needle?filterPublicIpaIndex(cacheIndex,{q:needle}):[];
  const metadataIds=idsBySource(metadataMatches);

  let onlyIds=null;
  if(ipaFilter!=='all'||iosTarget){
    const filtered=filterPublicIpaIndex(cacheIndex,{ipa:ipaFilter,ios:iosTarget});
    onlyIds=idsBySource(filtered);
  }

  const candidateLimit=Math.min(5000,Math.max(p.pageSize,p.page*p.pageSize));
  const settled=await Promise.allSettled(sources.map(s=>querySourceApps(s,{
    q:needle,sort,candidateLimit,
    onlyIds:onlyIds?[...(onlyIds.get(s.slug)||[])]:null,
    extraSearchIds:[...(metadataIds.get(s.slug)||[])]
  })));
  let total=0; const items=[]; const sourceErrors=[];
  settled.forEach((r,i)=>{ if(r.status==='fulfilled'){total+=r.value.count;items.push(...r.value.items)} else sourceErrors.push({source:sources[i].slug,message:r.reason?.message||'查询失败'}) });
  if(settled.every(x=>x.status==='rejected')) throw new AppError(503,'MYSQL_SOURCES_UNAVAILABLE','所有 MySQL 软件源均不可用',sourceErrors);
  items.sort(jsSort(sort));
  const base=items.slice(p.offset,p.offset+p.pageSize).map(({_updatedEpoch,...x})=>x);
  const sliced=await enrichFromIpaCache(base,cache);
  return {items:sliced,total,...p,sourceErrors,filters:{ipa:ipaFilter,ios:iosTarget}};
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
    const {_updatedEpoch,...publicApp}=app;
    return (await enrichFromIpaCache([publicApp]))[0];
  }
  if(/^\d+$/.test(String(idOrSlug))){
    const sources=await enabledSources();
    if(sources.length===1){
      const app=await rawApp(sources[0],Number(idOrSlug));
      if(app){ const {_updatedEpoch,...publicApp}=app; return (await enrichFromIpaCache([publicApp]))[0]; }
    }
  }
  return null;
}

export async function listVersions(appId,_includeDraft=false) {
  const app=await getApp(appId,true); if(!app)return [];
  return [{id:app.version_id,app_id:app.id,version:app.version||'',build:app.package_build||'',file_size:app.file_size,min_ios:app.min_ios,changelog:app.changelog||'',status:'published',release_date:app.release_date||app.updated_at||new Date().toISOString(),download_count:app.download_count,package_version:app.package_version||'',ipa_status:app.ipa_status||'unknown'}];
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
function readonly(){ throw new AppError(405,'SOURCE_MANAGED','应用由原 MySQL 软件源管理，新站仅提供只读查看'); }
export const createApp=readonly, updateApp=readonly, deleteApp=readonly, createVersion=readonly, updateVersion=readonly, deleteVersion=readonly, replaceVersionSources=readonly;
export async function getVersionSources(){ return []; }
