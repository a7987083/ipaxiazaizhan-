import { getMysqlSource, listMysqlSources, normalizeIpaSync, readOpenListIpaCache, updateMysqlSource, appendWritebackLog, readWritebackLog } from '../storage/controlStore.js';
import { fromHex, parseTsv, runMysql, safeIdentifier, sqlInt, sqlText } from './mysqlCli.js';

export const IPA_FIELD_DEFS=[
  {key:'name',label:'App 名称'},
  {key:'version',label:'版本号'},
  {key:'build',label:'Build'},
  {key:'bundle_id',label:'Bundle ID'},
  {key:'minimum_ios',label:'最低 iOS'},
  {key:'executable',label:'Executable'},
  {key:'size',label:'IPA 文件大小'},
  {key:'md5',label:'IPA MD5'}
];

const MODE_SET=new Set(['disabled','preview','auto_update']);
const STRATEGY_SET=new Set(['always','if_empty','if_changed','preview']);
const NUMERIC_TYPES=/^(?:tinyint|smallint|mediumint|int|integer|bigint|decimal|numeric|float|double|real|bit)/i;

function error(code,message,status=400){ return Object.assign(new Error(message),{code,status}); }
function nowIso(){ return new Date().toISOString(); }
function blank(v){ return v===null || v===undefined || String(v).trim()==='' || String(v).trim()==='0'; }
function same(a,b){ return String(a??'')===String(b??''); }
function currentParsed(file){ return Boolean(file?.parsed && !file?.parseError && (!file?.md5 || !file?.parsedMd5 || file.parsedMd5===file.md5)); }
function incomingValue(field,file){
  const meta=file?.parsed||{};
  if(field==='name') return String(meta.name||'');
  if(field==='version') return String(meta.version||'');
  if(field==='build') return String(meta.build||'');
  if(field==='bundle_id') return String(meta.bundle_id||'');
  if(field==='minimum_ios') return String(meta.minimum_ios||'');
  if(field==='executable') return String(meta.executable||'');
  if(field==='size') return String(Number(file?.size||0)||'');
  if(field==='md5') return String(file?.md5||'');
  return '';
}

export function validateIpaSyncConfig(input={},columns=[]){
  const cfg=normalizeIpaSync(input);
  if(!MODE_SET.has(cfg.mode)) throw error('IPA_SYNC_MODE_INVALID','数据库同步模式无效');
  const names=new Set(columns.map(x=>String(x.name||x.Field||x).toLowerCase()));
  const used=new Map();
  for(const def of IPA_FIELD_DEFS){
    const m=cfg.mappings?.[def.key];
    if(!m?.enabled) continue;
    if(!m.column) throw error('IPA_SYNC_COLUMN_REQUIRED',`${def.label} 已启用，但没有选择数据库字段`);
    if(!/^[A-Za-z0-9_]+$/.test(m.column)) throw error('IPA_SYNC_COLUMN_INVALID',`${def.label} 的数据库字段名不合法`);
    if(names.size && !names.has(m.column.toLowerCase())) throw error('IPA_SYNC_COLUMN_MISSING',`数据库中不存在字段 ${m.column}`);
    if(!STRATEGY_SET.has(m.strategy)) throw error('IPA_SYNC_STRATEGY_INVALID',`${def.label} 的写回策略无效`);
    const key=m.column.toLowerCase();
    if(used.has(key)) throw error('IPA_SYNC_COLUMN_CONFLICT',`${used.get(key)} 和 ${def.label} 不能同时写入 ${m.column}`);
    used.set(key,def.label);
  }
  return cfg;
}

export async function listSourceColumns(sourceId){
  const src=await getMysqlSource(sourceId,{withSecrets:true});
  if(!src) throw error('SOURCE_NOT_FOUND','软件源不存在',404);
  const table=safeIdentifier(src.config.table||'fa_category');
  const rows=parseTsv(await runMysql(src.config,`SHOW COLUMNS FROM ${table}`,{timeoutMs:12000}));
  return rows.map(([name,type,nullable,key,defaultValue,extra])=>({
    name:String(name||''),type:String(type||''),nullable:String(nullable||'')==='YES',key:String(key||''),defaultValue:defaultValue??null,extra:String(extra||'')
  }));
}

export async function saveSourceIpaSync(sourceId,input){
  const columns=await listSourceColumns(sourceId);
  const cfg=validateIpaSyncConfig(input,columns);
  const updated=await updateMysqlSource(sourceId,{ipaSync:cfg});
  if(!updated) throw error('SOURCE_NOT_FOUND','软件源不存在',404);
  return {source:updated,columns};
}

function selectedMappings(cfg,columns){
  const byName=new Map(columns.map(c=>[String(c.name).toLowerCase(),c]));
  return IPA_FIELD_DEFS.map(def=>{
    const m=cfg.mappings?.[def.key];
    if(!m?.enabled) return null;
    return {...def,...m,columnInfo:byName.get(String(m.column).toLowerCase())};
  }).filter(Boolean);
}

function sqlValue(value,columnInfo){
  if(NUMERIC_TYPES.test(String(columnInfo?.type||''))){
    const n=Number(value);
    if(!Number.isFinite(n)) return null;
    return String(n);
  }
  return sqlText(value);
}

function shouldWrite(strategy,currentValue,nextValue){
  if(strategy==='preview') return false;
  if(String(nextValue??'')==='') return false;
  if(strategy==='if_empty') return blank(currentValue);
  if(strategy==='if_changed') return !same(currentValue,nextValue);
  if(strategy==='always') return !same(currentValue,nextValue);
  return false;
}

async function readCurrentRows(src,ids,mappings){
  if(!ids.length) return new Map();
  const table=safeIdentifier(src.config.table||'fa_category');
  const select=mappings.map(m=>`HEX(CAST(${safeIdentifier(m.column)} AS CHAR))`).join(',');
  const sql=`SELECT id${select?`,`+select:''} FROM ${table} WHERE id IN (${ids.map(x=>sqlInt(x)).join(',')})`;
  const rows=parseTsv(await runMysql(src.config,sql,{timeoutMs:20000}));
  const out=new Map();
  for(const row of rows){
    const id=Number(row[0]);
    const values={};
    mappings.forEach((m,i)=>{ values[m.column]=fromHex(row[i+1]); });
    out.set(id,values);
  }
  return out;
}

export function buildWritePlan({ref,file,currentValues={},mappings=[]}){
  if(!ref || !currentParsed(file)) return null;
  const fields=[];
  for(const m of mappings){
    const nextValue=incomingValue(m.key,file);
    const oldValue=currentValues[m.column]??'';
    const eligible=String(nextValue??'')!=='';
    fields.push({
      sourceField:m.key,label:m.label,column:m.column,strategy:m.strategy,
      oldValue:String(oldValue??''),newValue:String(nextValue??''),eligible,
      willWrite:eligible && shouldWrite(m.strategy,oldValue,nextValue)
    });
  }
  return {appKey:ref.appKey,legacyId:Number(ref.legacyId||0),appName:ref.name||file?.parsed?.name||'',apiPath:ref.apiPath||'',md5:String(file?.md5||''),parsedAt:file?.parsedAt||null,fields,changes:fields.filter(x=>x.willWrite).length};
}

async function prepareSource(sourceId,{limit=100,appKeys=[]}={}){
  const src=await getMysqlSource(sourceId,{withSecrets:true});
  if(!src) throw error('SOURCE_NOT_FOUND','软件源不存在',404);
  const columns=await listSourceColumns(sourceId);
  const cfg=validateIpaSyncConfig(src.config.ipaSync||{},columns);
  const mappings=selectedMappings(cfg,columns);
  const cache=await readOpenListIpaCache();
  const allowKeys=new Set((appKeys||[]).map(String));
  let refs=Object.values(cache.appRefs||{}).filter(ref=>ref?.sourceSlug===src.slug && ref?.legacyId);
  if(allowKeys.size) refs=refs.filter(ref=>allowKeys.has(String(ref.appKey)));
  refs=refs.filter(ref=>currentParsed(cache.files?.[ref.apiPath])).slice(0,Math.min(500,Math.max(1,Number(limit)||100)));
  const current=await readCurrentRows(src,[...new Set(refs.map(x=>Number(x.legacyId)))],mappings);
  const plans=refs.map(ref=>buildWritePlan({ref,file:cache.files?.[ref.apiPath],currentValues:current.get(Number(ref.legacyId))||{},mappings})).filter(Boolean);
  return {src,columns,cfg,mappings,cache,plans};
}

export async function previewIpaWriteback({sourceId,limit=100,appKeys=[]}={}){
  const {src,cfg,plans}=await prepareSource(sourceId,{limit,appKeys});
  return {
    source:{id:src.id,name:src.name,slug:src.slug,table:src.config.table||'fa_category'},
    mode:cfg.mode,
    total:plans.length,
    changed:plans.filter(x=>x.changes>0).length,
    fields:IPA_FIELD_DEFS,
    items:plans
  };
}

export async function applyIpaWriteback({sourceId,limit=50,appKeys=[],trigger='manual'}={}){
  const {src,cfg,mappings,plans}=await prepareSource(sourceId,{limit,appKeys});
  if(cfg.mode==='disabled') throw error('IPA_SYNC_DISABLED','该软件源的数据库写回已关闭',409);
  if(!mappings.length) throw error('IPA_SYNC_NO_FIELDS','没有启用任何写回字段',409);
  const table=safeIdentifier(src.config.table||'fa_category');
  let updated=0,skipped=0,failed=0;
  const results=[];
  for(const plan of plans){
    const changes=plan.fields.filter(x=>x.willWrite);
    if(!changes.length){ skipped+=1; results.push({...plan,status:'skipped'}); continue; }
    const sets=[];
    for(const ch of changes){
      const mapping=mappings.find(x=>x.key===ch.sourceField && x.column===ch.column);
      const literal=sqlValue(ch.newValue,mapping?.columnInfo);
      if(literal===null) continue;
      sets.push(`${safeIdentifier(ch.column)}=${literal}`);
    }
    if(!sets.length){ skipped+=1; results.push({...plan,status:'skipped'}); continue; }
    try{
      const sql=`UPDATE ${table} SET ${sets.join(',')} WHERE id=${sqlInt(plan.legacyId)} LIMIT 1`;
      await runMysql(src.config,sql,{timeoutMs:12000});
      updated+=1;
      const event={at:nowIso(),trigger,sourceId:src.id,sourceSlug:src.slug,appKey:plan.appKey,legacyId:plan.legacyId,appName:plan.appName,md5:plan.md5,changes};
      await appendWritebackLog(event);
      results.push({...plan,status:'updated'});
    }catch(e){
      failed+=1;
      results.push({...plan,status:'failed',error:String(e?.message||'写回失败').slice(0,300)});
    }
  }
  return {source:{id:src.id,name:src.name,slug:src.slug},mode:cfg.mode,total:plans.length,updated,skipped,failed,items:results};
}

export async function autoWritebackEnabledSources({limitPerSource=50}={}){
  const sources=(await listMysqlSources()).filter(x=>x.enabled!==false && x.ipaSync?.mode==='auto_update');
  const results=[];
  for(const src of sources){
    try{ results.push(await applyIpaWriteback({sourceId:src.id,limit:limitPerSource,trigger:'auto_parse'})); }
    catch(e){ results.push({source:{id:src.id,name:src.name,slug:src.slug},failed:1,error:String(e?.message||'自动写回失败').slice(0,300)}); }
  }
  return results;
}

export async function listWritebackHistory(limit=100){ return readWritebackLog(limit); }
