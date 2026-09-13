import fs from 'node:fs/promises';
import path from 'node:path';
import {
  CONTROL_DIR, getMysqlSource, getOpenListConfig, listMysqlSources, readOpenListIpaCache
} from '../storage/controlStore.js';
import { fromHex, parseTsv, runMysql, safeIdentifier, sqlInt, sqlText } from './mysqlCli.js';

const CONFIG_FILE=path.join(CONTROL_DIR,'source-writeback.json');
const HISTORY_FILE=path.join(CONTROL_DIR,'source-writeback-history.jsonl');
const STATE_FILE=path.join(CONTROL_DIR,'source-writeback-state.json');

export const WRITEBACK_SOURCES=[
  {key:'package_name',label:'IPA 包内名称',suggest:['name'],defaultStrategy:'preview'},
  {key:'package_version',label:'IPA 版本号',suggest:['nickname','version'],defaultStrategy:'changed'},
  {key:'package_build',label:'IPA Build',suggest:['build','build_version'],defaultStrategy:'changed'},
  {key:'bundle_id',label:'Bundle ID',suggest:['bundle_id','bundleid','bundle'],defaultStrategy:'empty'},
  {key:'minimum_ios',label:'最低 iOS',suggest:['min_ios','minimum_ios','minimumosversion'],defaultStrategy:'empty'},
  {key:'file_size',label:'IPA 实际大小',suggest:['bt2a','file_size','size'],defaultStrategy:'changed'},
  {key:'download_url',label:'IPA 下载链接',suggest:['bt1a','download_url','url'],defaultStrategy:'changed'},
  {key:'executable',label:'Executable',suggest:['executable'],defaultStrategy:'empty'},
  {key:'md5',label:'IPA MD5',suggest:['md5','ipa_md5'],defaultStrategy:'changed'}
];
export const WRITEBACK_FIELDS=WRITEBACK_SOURCES;
const SOURCE_MAP=new Map(WRITEBACK_SOURCES.map(x=>[x.key,x]));
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
async function readConfigStore(){return readJson(CONFIG_FILE,{version:2,sources:{}})}
async function writeConfigStore(value){return writeJson(CONFIG_FILE,{version:2,sources:value?.sources||{}})}
async function readState(){return readJson(STATE_FILE,{version:1,cursors:{},lastRunAt:null})}
async function writeState(value){return writeJson(STATE_FILE,{version:1,cursors:value?.cursors||{},lastRunAt:value?.lastRunAt||null})}

function cleanColumn(v=''){
  const s=String(v||'').trim();
  return /^[A-Za-z0-9_]+$/.test(s)?s:'';
}
function cleanRuleId(v='',fallback=''){
  const s=String(v||'').trim();
  return /^[A-Za-z0-9_-]{1,80}$/.test(s)?s:fallback;
}
function normalizeRule(raw={},index=0){
  const source=SOURCE_MAP.has(String(raw.source||''))?String(raw.source):'';
  const def=SOURCE_MAP.get(source);
  const strategy=STRATEGIES.has(String(raw.strategy||''))?String(raw.strategy):(def?.defaultStrategy||'preview');
  return {
    id:cleanRuleId(raw.id,`rule-${index+1}`),
    enabled:raw.enabled===true,
    source,
    column:cleanColumn(raw.column),
    strategy
  };
}
function legacyRules(input={}){
  if(Array.isArray(input?.rules))return input.rules;
  if(input?.mappings&&typeof input.mappings==='object'){
    return WRITEBACK_SOURCES.map((field,index)=>{
      const raw=input.mappings[field.key]||{};
      return {
        id:`legacy-${field.key}`,
        enabled:raw.enabled===true,
        source:field.key,
        column:cleanColumn(raw.column),
        strategy:STRATEGIES.has(String(raw.strategy||''))?String(raw.strategy):field.defaultStrategy
      };
    });
  }
  return WRITEBACK_SOURCES.map(field=>({
    id:`default-${field.key}`,
    enabled:false,
    source:field.key,
    column:'',
    strategy:field.defaultStrategy
  }));
}
export function normalizeWriteBackConfig(input={}){
  const seen=new Set();
  const rules=legacyRules(input).slice(0,50).map((raw,index)=>normalizeRule(raw,index)).map((rule,index)=>{
    let id=rule.id||`rule-${index+1}`;
    if(seen.has(id))id=`${id}-${index+1}`;
    seen.add(id);
    return {...rule,id};
  });
  return {enabled:input?.enabled===true,autoApply:input?.autoApply===true,rules};
}
function suggestColumn(sourceKey,columns){
  const field=SOURCE_MAP.get(sourceKey);
  if(!field)return '';
  const names=new Set(columns.map(x=>String(x.name||'').toLowerCase()));
  return field.suggest.find(x=>names.has(x.toLowerCase()))||'';
}
function withSuggestions(config,columns){
  const next=normalizeWriteBackConfig(config);
  next.rules=next.rules.map(rule=>rule.column?rule:{...rule,column:suggestColumn(rule.source,columns)});
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
  for(const [index,rule] of normalized.rules.entries()){
    if(!rule.enabled)continue;
    const source=SOURCE_MAP.get(rule.source);
    const title=source?.label||`规则 ${index+1}`;
    if(!source){errors.push(`${title} 没有选择有效的数据来源`);continue}
    if(!rule.column){errors.push(`${title} 已启用但没有选择数据库字段`);continue}
    if(names.size&&!names.has(rule.column))errors.push(`${title} 映射的字段 ${rule.column} 不存在`);
    if(used.has(rule.column))errors.push(`${title} 与 ${used.get(rule.column)} 不能同时写入 ${rule.column}`);
    else used.set(rule.column,title);
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
    sources:WRITEBACK_SOURCES,
    fields:WRITEBACK_SOURCES,
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
  return {source:{id:source.id,name:source.name,slug:source.slug},config,sources:WRITEBACK_SOURCES,fields:WRITEBACK_SOURCES,columns};
}

function currentParsed(cache,ref){
  const apiPath=ref?.apiPath||cache?.apps?.[ref?.appKey];
  const file=apiPath?cache?.files?.[apiPath]:null;
  if(!file||file.missing||file.parseError||!file.parsed)return null;
  const md5=String(file.md5||'').toUpperCase(),parsedMd5=String(file.parsedMd5||'').toUpperCase();
  if(!md5||!parsedMd5||md5!==parsedMd5)return null;
  return {apiPath,file};
}

function cleanPathPrefix(v='/'){
  let s=String(v||'/').trim();
  if(!s.startsWith('/'))s=`/${s}`;
  while(s.includes('//'))s=s.replaceAll('//','/');
  return s;
}
function canonicalDownloadUrl(openListRow,apiPath=''){
  const cfg=openListRow?.config||{};
  if(!cfg.url||!apiPath)return '';
  try{
    const apiBase=cleanPathPrefix(cfg.apiBasePath||'/').replace(/\/+$/,'')||'/';
    let rel=cleanPathPrefix(apiPath);
    if(apiBase!=='/'&&rel.startsWith(`${apiBase}/`))rel=rel.slice(apiBase.length);
    rel=rel.replace(/^\/+/,'');
    const prefix=cleanPathPrefix(cfg.publicPathPrefix||'/d/a/app/').replace(/\/+$/,'')+'/';
    const u=new URL(String(cfg.url).replace(/\/+$/,'')+'/');
    u.pathname=`${prefix}${rel.split('/').filter(Boolean).map(encodeURIComponent).join('/')}`;
    u.search='';u.hash='';
    return u.toString();
  }catch{return ''}
}

function metadataValues(file,{downloadUrl=''}={}){
  const p=file?.parsed||{};
  return {
    package_name:String(p.name||''),
    package_version:String(p.version||''),
    package_build:String(p.build||''),
    bundle_id:String(p.bundle_id||''),
    minimum_ios:String(p.minimum_ios||''),
    file_size:Number(file?.size||0)>0?String(Math.round(Number(file.size))):'',
    download_url:String(downloadUrl||'').trim(),
    executable:String(p.executable||''),
    md5:String(file?.md5||'').toUpperCase()
  };
}
function sameValue(sourceKey,a,b){
  if(sourceKey==='file_size')return Number(a||0)===Number(b||0);
  return String(a??'').trim()===String(b??'').trim();
}
export function buildWriteBackPlan({metadata={},current={},config={}}={}){
  const normalized=normalizeWriteBackConfig(config);
  const changes=[];
  for(const rule of normalized.rules){
    if(!rule.enabled||!rule.column||!SOURCE_MAP.has(rule.source))continue;
    const next=String(metadata[rule.source]??'').trim();
    if(!next)continue;
    const before=String(current[rule.column]??'').trim();
    if(sameValue(rule.source,before,next))continue;
    let willWrite=false;
    if(rule.strategy==='changed'||rule.strategy==='always')willWrite=true;
    else if(rule.strategy==='empty')willWrite=before==='';
    const field=SOURCE_MAP.get(rule.source);
    changes.push({
      ruleId:rule.id,field:rule.source,label:field.label,column:rule.column,strategy:rule.strategy,
      before,next,willWrite:willWrite&&rule.strategy!=='preview'
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
  const [cache,openListRow]=await Promise.all([readOpenListIpaCache(),getOpenListConfig({withSecret:true})]);
  const refs=cacheRefsForSource(cache,source.slug,{limit,afterAppKey,appKeys});
  const enabledRules=config.rules.filter(rule=>rule.enabled&&rule.column&&SOURCE_MAP.has(rule.source));
  const mappedColumns=[...new Set(enabledRules.map(rule=>rule.column))];
  if(enabledRules.some(rule=>rule.source==='download_url')&&!mappedColumns.includes('bt1a'))mappedColumns.push('bt1a');
  const current=await loadCurrentRows(source,refs.map(x=>x.legacyId),mappedColumns);
  const items=refs.map(ref=>{
    const parsed=currentParsed(cache,ref);
    const row=current.get(Number(ref.legacyId))||{};
    const metadata=metadataValues(parsed.file,{downloadUrl:canonicalDownloadUrl(openListRow,parsed.apiPath)||row.bt1a||''});
    const changes=buildWriteBackPlan({metadata,current:row,config});
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
function sqlValue(sourceKey,value){
  if(sourceKey==='file_size')return sqlInt(value);
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
  if(!raw.enabled)throw Object.assign(new Error('该软件源尚未允许写入数据库；当前只能预览'),{code:'WRITEBACK_DISABLED'});
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
      const event={at:new Date().toISOString(),mode,sourceId:source.id,sourceSlug:source.slug,sourceName:source.name,appKey:item.appKey,legacyId:item.legacyId,appName:item.appName,md5:item.md5,changes:writes.map(x=>({ruleId:x.ruleId,field:x.field,column:x.column,before:x.before,next:x.next,strategy:x.strategy})),status:'success'};
      await appendHistory(event).catch(()=>{});
      results.push({...item,status:'success'});
    }catch(e){
      failed+=1;
      const event={at:new Date().toISOString(),mode,sourceId:source.id,sourceSlug:source.slug,sourceName:source.name,appKey:item.appKey,legacyId:item.legacyId,appName:item.appName,md5:item.md5,changes:writes.map(x=>({ruleId:x.ruleId,field:x.field,column:x.column,before:x.before,next:x.next,strategy:x.strategy})),status:'failed',error:String(e?.message||'写回失败').slice(0,500)};
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
