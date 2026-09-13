import fs from 'node:fs/promises';
import path from 'node:path';
import {
  CONTROL_DIR, getMysqlSource, listMysqlSources, readOpenListIpaCache
} from '../storage/controlStore.js';
import { fromHex, parseTsv, runMysql, safeIdentifier, sqlInt, sqlText } from './mysqlCli.js';

const CONFIG_FILE=path.join(CONTROL_DIR,'source-writeback.json');
const HISTORY_FILE=path.join(CONTROL_DIR,'source-writeback-history.jsonl');
const STATE_FILE=path.join(CONTROL_DIR,'source-writeback-state.json');

export const WRITEBACK_FIELDS=[
  {key:'package_name',label:'IPA 包内名称',suggest:['name'],defaultStrategy:'preview'},
  {key:'package_version',label:'IPA 版本号',suggest:['nickname','version'],defaultStrategy:'changed'},
  {key:'package_build',label:'IPA Build',suggest:['build','build_version'],defaultStrategy:'changed'},
  {key:'bundle_id',label:'Bundle ID',suggest:['bundle_id','bundleid','bundle'],defaultStrategy:'empty'},
  {key:'minimum_ios',label:'最低 iOS',suggest:['min_ios','minimum_ios','minimumosversion'],defaultStrategy:'empty'},
  {key:'file_size',label:'IPA 实际大小',suggest:['bt2a','file_size','size'],defaultStrategy:'changed'},
  {key:'executable',label:'Executable',suggest:['executable'],defaultStrategy:'empty'},
  {key:'md5',label:'IPA MD5',suggest:['md5','ipa_md5'],defaultStrategy:'changed'}
];
const FIELD_MAP=new Map(WRITEBACK_FIELDS.map(x=>[x.key,x]));
const STRATEGIES=new Set(['preview','changed','empty','always']);
let writeQueue=Promise.resolve();
let schedulerTimer=null;
let schedulerRunning=false;

async function readJson(file,fallback){
  try{return JSON.parse(await fs.readFile(file,'utf8'))}
  catch(e){if(e?.code==='ENOENT')return fallback;throw e}
}
async function writeJson(file,value){
  await fs.mkdir(path.dirname(file),{recursive:true,mode:0o750});
  const tmp=`${file}.tmp-${process.pid}-${Date.now()}`;
  writeQueue=writeQueue.then(async()=>{
    await fs.writeFile(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});
    await fs.rename(tmp,file);
    await fs.chmod(file,0o600).catch(()=>{});
  });
  return writeQueue;
}
async function readConfigStore(){return readJson(CONFIG_FILE,{version:1,sources:{}})}
async function writeConfigStore(value){return writeJson(CONFIG_FILE,{version:1,sources:value?.sources||{}})}
async function readState(){return readJson(STATE_FILE,{version:1,cursors:{},lastRunAt:null})}
async function writeState(value){return writeJson(STATE_FILE,{version:1,cursors:value?.cursors||{},lastRunAt:value?.lastRunAt||null})}

function cleanColumn(v=''){
  const s=String(v||'').trim();
  return /^[A-Za-z0-9_]+$/.test(s)?s:'';
}
export function normalizeWriteBackConfig(input={}){
  const mappings={};
  for(const field of WRITEBACK_FIELDS){
    const raw=input?.mappings?.[field.key]||{};
    mappings[field.key]={
      enabled:raw.enabled===true,
      column:cleanColumn(raw.column),
      strategy:STRATEGIES.has(String(raw.strategy||''))?String(raw.strategy):field.defaultStrategy
    };
  }
  return {enabled:input?.enabled===true,autoApply:input?.autoApply===true,mappings};
}
function suggestColumn(field,columns){
  const names=new Set(columns.map(x=>String(x.name||'').toLowerCase()));
  return field.suggest.find(x=>names.has(x.toLowerCase()))||'';
}
function withSuggestions(config,columns){
  const next=normalizeWriteBackConfig(config);
  for(const field of WRITEBACK_FIELDS){
    if(!next.mappings[field.key].column) next.mappings[field.key].column=suggestColumn(field,columns);
  }
  return next;
}
async function sourceConfig(source){
  const store=await readConfigStore();
  return normalizeWriteBackConfig(store.sources?.[source.slug]||{});
}
async function saveSourceConfig(source,config){
  const store=await readConfigStore();
  store.sources[source.slug]={...normalizeWriteBackConfig(config),updatedAt:new Date().toISOString()};
  await writeConfigStore(store);
  return store.sources[source.slug];
}

export async function listMysqlColumns(config){
  const table=safeIdentifier(config.table||'fa_category');
  const rows=parseTsv(await runMysql(config,`SHOW COLUMNS FROM ${table}`,{timeoutMs:12000}));
  return rows.map(r=>({name:String(r[0]||''),type:String(r[1]||''),nullable:String(r[2]||'').toUpperCase()==='YES',key:String(r[3]||''),defaultValue:r[4]??null,extra:String(r[5]||'')})).filter(x=>x.name);
}

export function validateWriteBackConfig(config,columns=[]){
  const normalized=normalizeWriteBackConfig(config);
  const names=new Set(columns.map(x=>x.name));
  const used=new Map();
  const errors=[];
  for(const field of WRITEBACK_FIELDS){
    const m=normalized.mappings[field.key];
    if(!m.enabled)continue;
    if(!m.column){errors.push(`${field.label} 已启用但没有选择数据库字段`);continue}
    if(names.size&&!names.has(m.column))errors.push(`${field.label} 映射的字段 ${m.column} 不存在`);
    if(used.has(m.column))errors.push(`${field.label} 与 ${used.get(m.column)} 不能同时写入 ${m.column}`);
    else used.set(m.column,field.label);
  }
  return {ok:errors.length===0,errors,config:normalized};
}

export async function getSourceWriteBack(sourceId){
  const source=await getMysqlSource(sourceId,{withSecrets:true});
  if(!source)return null;
  const columns=await listMysqlColumns(source.config);
  const saved=await sourceConfig(source);
  const config=withSuggestions(saved,columns);
  return {
    source:{id:source.id,name:source.name,slug:source.slug,table:source.config.table||'fa_category'},
    config,
    fields:WRITEBACK_FIELDS,
    columns
  };
}

export async function saveSourceWriteBack(sourceId,input){
  const source=await getMysqlSource(sourceId,{withSecrets:true});
  if(!source)return null;
  const columns=await listMysqlColumns(source.config);
  const checked=validateWriteBackConfig(input,columns);
  if(!checked.ok)throw Object.assign(new Error(checked.errors.join('；')),{code:'WRITEBACK_CONFIG_INVALID',details:checked.errors});
  const config=await saveSourceConfig(source,checked.config);
  return {source:{id:source.id,name:source.name,slug:source.slug},config,fields:WRITEBACK_FIELDS,columns};
}

function currentParsed(cache,ref){
  const apiPath=ref?.apiPath||cache?.apps?.[ref?.appKey];
  const file=apiPath?cache?.files?.[apiPath]:null;
  if(!file||file.missing||file.parseError||!file.parsed)return null;
  const md5=String(file.md5||'').toUpperCase(),parsedMd5=String(file.parsedMd5||'').toUpperCase();
  if(!md5||!parsedMd5||md5!==parsedMd5)return null;
  return {apiPath,file};
}
function metadataValues(file){
  const p=file?.parsed||{};
  return {
    package_name:String(p.name||''),
    package_version:String(p.version||''),
    package_build:String(p.build||''),
    bundle_id:String(p.bundle_id||''),
    minimum_ios:String(p.minimum_ios||''),
    file_size:Number(file?.size||0)>0?String(Math.round(Number(file.size))):'',
    executable:String(p.executable||''),
    md5:String(file?.md5||'').toUpperCase()
  };
}
function sameValue(fieldKey,a,b){
  if(fieldKey==='file_size')return Number(a||0)===Number(b||0);
  return String(a??'').trim()===String(b??'').trim();
}
export function buildWriteBackPlan({metadata={},current={},config={}}={}){
  const normalized=normalizeWriteBackConfig(config);
  const changes=[];
  for(const field of WRITEBACK_FIELDS){
    const m=normalized.mappings[field.key];
    if(!m.enabled||!m.column)continue;
    const next=String(metadata[field.key]??'').trim();
    if(!next)continue;
    const before=String(current[m.column]??'').trim();
    if(sameValue(field.key,before,next))continue;
    let willWrite=false;
    if(m.strategy==='changed'||m.strategy==='always')willWrite=true;
    else if(m.strategy==='empty')willWrite=before==='';
    changes.push({
      field:field.key,label:field.label,column:m.column,strategy:m.strategy,
      before,next,willWrite:willWrite&&m.strategy!=='preview'
    });
  }
  return changes;
}
function currentRowsSql(source,ids,columns){
  if(!ids.length)return '';
  const table=safeIdentifier(source.config.table||'fa_category');
  const cols=columns.map(c=>`HEX(CAST(${safeIdentifier(c)} AS CHAR))`).join(',');
  return `SELECT id${cols?`,${cols}`:''} FROM ${table} WHERE id IN (${ids.map(x=>sqlInt(x)).join(',')})`;
}
async function loadCurrentRows(source,ids,columns){
  if(!ids.length)return new Map();
  const out=parseTsv(await runMysql(source.config,currentRowsSql(source,ids,columns),{timeoutMs:20000}));
  const map=new Map();
  for(const row of out){
    const values={};
    columns.forEach((c,i)=>values[c]=fromHex(row[i+1]));
    map.set(Number(row[0]),values);
  }
  return map;
}
function cacheRefsForSource(cache,slug,{afterAppKey='',limit=50,appKeys=[]}={}){
  const allow=new Set((appKeys||[]).map(String));
  return Object.values(cache?.appRefs||{})
    .filter(ref=>ref?.sourceSlug===slug&&ref?.appKey)
    .filter(ref=>!allow.size||allow.has(String(ref.appKey)))
    .filter(ref=>!afterAppKey||String(ref.appKey)>String(afterAppKey))
    .sort((a,b)=>String(a.appKey).localeCompare(String(b.appKey)))
    .filter(ref=>currentParsed(cache,ref))
    .slice(0,Math.min(200,Math.max(1,Number(limit)||50)));
}

export async function previewSourceWriteBack(sourceId,{limit=50,afterAppKey='',appKeys=[]}={}){
  const source=await getMysqlSource(sourceId,{withSecrets:true});
  if(!source)return null;
  const columns=await listMysqlColumns(source.config);
  const raw=await sourceConfig(source);
  const config=withSuggestions(raw,columns);
  const checked=validateWriteBackConfig(config,columns);
  if(!checked.ok)throw Object.assign(new Error(checked.errors.join('；')),{code:'WRITEBACK_CONFIG_INVALID'});
  const cache=await readOpenListIpaCache();
  const refs=cacheRefsForSource(cache,source.slug,{limit,afterAppKey,appKeys});
  const mappedColumns=[...new Set(WRITEBACK_FIELDS.map(f=>config.mappings[f.key]).filter(m=>m.enabled&&m.column).map(m=>m.column))];
  const current=await loadCurrentRows(source,refs.map(x=>x.legacyId),mappedColumns);
  const items=refs.map(ref=>{
    const parsed=currentParsed(cache,ref);
    const metadata=metadataValues(parsed.file);
    const changes=buildWriteBackPlan({metadata,current:current.get(Number(ref.legacyId))||{},config});
    return {
      appKey:ref.appKey,legacyId:Number(ref.legacyId),appName:String(ref.name||metadata.package_name||''),
      sourceSlug:source.slug,sourceName:source.name,md5:metadata.md5,parsedAt:parsed.file.parsedAt||null,
      changes,writeCount:changes.filter(x=>x.willWrite).length,previewCount:changes.length
    };
  });
  return {
    source:{id:source.id,name:source.name,slug:source.slug,table:source.config.table||'fa_category'},
    config,items,
    nextCursor:items.length>=Math.min(200,Math.max(1,Number(limit)||50))?String(items.at(-1)?.appKey||''):'',
    scanned:items.length,changeApps:items.filter(x=>x.writeCount>0).length,
    writeFields:items.reduce((n,x)=>n+x.writeCount,0)
  };
}
function sqlValue(fieldKey,value){
  if(fieldKey==='file_size')return sqlInt(value);
  return sqlText(value);
}
async function appendHistory(event){
  await fs.mkdir(path.dirname(HISTORY_FILE),{recursive:true,mode:0o750});
  await fs.appendFile(HISTORY_FILE,JSON.stringify(event)+'\n',{mode:0o600});
}
export async function applySourceWriteBack(sourceId,{limit=50,afterAppKey='',appKeys=[],mode='manual'}={}){
  const source=await getMysqlSource(sourceId,{withSecrets:true});
  if(!source)return null;
  const raw=await sourceConfig(source);
  if(!raw.enabled)throw Object.assign(new Error('该软件源尚未启用数据库写回'),{code:'WRITEBACK_DISABLED'});
  if(mode==='auto'&&!raw.autoApply)return {source:{id:source.id,slug:source.slug},applied:0,apps:0,skipped:true,nextCursor:''};
  const preview=await previewSourceWriteBack(sourceId,{limit,afterAppKey,appKeys});
  const table=safeIdentifier(source.config.table||'fa_category');
  let applied=0,apps=0,failed=0;
  const results=[];
  for(const item of preview.items){
    const writes=item.changes.filter(x=>x.willWrite);
    if(!writes.length){results.push({...item,status:'unchanged'});continue}
    const setSql=writes.map(x=>`${safeIdentifier(x.column)}=${sqlValue(x.field,x.next)}`).join(',');
    try{
      await runMysql(source.config,`UPDATE ${table} SET ${setSql} WHERE id=${sqlInt(item.legacyId)} LIMIT 1`,{timeoutMs:15000});
      applied+=writes.length;apps+=1;
      const event={at:new Date().toISOString(),mode,sourceId:source.id,sourceSlug:source.slug,sourceName:source.name,appKey:item.appKey,legacyId:item.legacyId,appName:item.appName,md5:item.md5,changes:writes.map(x=>({field:x.field,column:x.column,before:x.before,next:x.next,strategy:x.strategy})),status:'success'};
      await appendHistory(event).catch(()=>{});
      results.push({...item,status:'success'});
    }catch(e){
      failed+=1;
      const event={at:new Date().toISOString(),mode,sourceId:source.id,sourceSlug:source.slug,sourceName:source.name,appKey:item.appKey,legacyId:item.legacyId,appName:item.appName,md5:item.md5,changes:writes.map(x=>({field:x.field,column:x.column,before:x.before,next:x.next,strategy:x.strategy})),status:'failed',error:String(e?.message||'写回失败').slice(0,500)};
      await appendHistory(event).catch(()=>{});
      results.push({...item,status:'failed',error:event.error});
    }
  }
  return {source:preview.source,applied,apps,failed,scanned:preview.scanned,nextCursor:preview.nextCursor,results};
}

export async function getWriteBackHistory(sourceId,{limit=50}={}){
  const source=await getMysqlSource(sourceId,{withSecrets:false});
  if(!source)return null;
  let text='';
  try{text=await fs.readFile(HISTORY_FILE,'utf8')}catch(e){if(e?.code!=='ENOENT')throw e}
  const items=text.split('\n').filter(Boolean).slice(-1000).map(line=>{try{return JSON.parse(line)}catch{return null}}).filter(Boolean)
    .filter(x=>x.sourceSlug===source.slug).slice(-Math.min(200,Math.max(1,Number(limit)||50))).reverse();
  return {source:{id:source.id,name:source.name,slug:source.slug},items};
}

export async function autoWriteBackTick(){
  if(schedulerRunning)return;
  schedulerRunning=true;
  try{
    const sources=(await listMysqlSources({withSecrets:true})).filter(x=>x.enabled!==false);
    const state=await readState();
    for(const source of sources){
      const cfg=await sourceConfig(source);
      if(!cfg.enabled||!cfg.autoApply)continue;
      const after=String(state.cursors?.[source.slug]||'');
      try{
        const result=await applySourceWriteBack(source.id,{limit:50,afterAppKey:after,mode:'auto'});
        state.cursors[source.slug]=result?.nextCursor||'';
      }catch(e){
        console.error(`WriteBack ${source.slug}:`,e?.message||e);
      }
    }
    state.lastRunAt=new Date().toISOString();
    await writeState(state);
  }finally{schedulerRunning=false}
}
export function startWriteBackScheduler(){
  if(schedulerTimer)return;
  const run=()=>autoWriteBackTick().catch(e=>console.error('WriteBack scheduler:',e?.message||e));
  schedulerTimer=setInterval(run,60_000);
  schedulerTimer.unref?.();
  const first=setTimeout(run,15_000); first.unref?.();
}
