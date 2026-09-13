import fs from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { decryptJson, encryptJson } from '../utils/crypto.js';

const CONTROL_DIR = env.CONTROL_DIR;
const ADMIN_FILE = path.join(CONTROL_DIR, 'admin.json');
const SETTINGS_FILE = path.join(CONTROL_DIR, 'settings.json');
const SOURCES_FILE = path.join(CONTROL_DIR, 'mysql-sources.json');
const OPENLIST_FILE = path.join(CONTROL_DIR, 'openlist.json');
const IPA_CACHE_FILE = path.join(CONTROL_DIR, 'openlist-ipa-cache.json');
const OPENLIST_DIR_CACHE_FILE = path.join(CONTROL_DIR, 'openlist-directory-cache.json');
const OPENLIST_TASK_FILE = path.join(CONTROL_DIR, 'openlist-task.json');
const DOWNLOAD_DIR = path.join(CONTROL_DIR, 'downloads');

let writeQueue = Promise.resolve();

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (e) { if (e?.code === 'ENOENT') return fallback; throw e; }
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), {recursive:true, mode:0o750});
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  const body = JSON.stringify(value, null, 2) + '\n';
  writeQueue = writeQueue.then(async()=>{
    await fs.writeFile(tmp, body, {mode:0o600});
    await fs.rename(tmp, file);
    await fs.chmod(file, 0o600).catch(()=>{});
  });
  return writeQueue;
}

function cleanSlug(v='') {
  const s=String(v).trim().toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'');
  return s || `source-${Date.now()}`;
}

function normalizeSchedule(input={}) {
  return {
    enabled: input?.enabled === true,
    intervalMinutes: Math.min(1440,Math.max(5,Number(input?.intervalMinutes)||10)),
    parseLimit: Math.min(20,Math.max(1,Number(input?.parseLimit)||3))
  };
}

function publicSource(row) {
  let cfg={};
  try { cfg=decryptJson(row.configEncrypted); } catch {}
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    type: 'mysql',
    enabled: row.enabled !== false,
    priority: Number(row.priority||100),
    host: cfg.host || '',
    port: Number(cfg.port||3306),
    database: cfg.database || '',
    username: cfg.username || '',
    table: cfg.table || 'fa_category',
    writeStats: cfg.writeStats === true,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    base_url: cfg.database ? `${cfg.host||'127.0.0.1'}:${cfg.port||3306}/${cfg.database}` : ''
  };
}

function publicOpenList(row) {
  let cfg={};
  try { cfg=decryptJson(row?.configEncrypted); } catch {}
  return {
    enabled: row?.enabled !== false,
    url: cfg.url || '',
    publicPathPrefix: cfg.publicPathPrefix || '/d/a/app/',
    apiBasePath: cfg.apiBasePath || '/',
    tokenConfigured: Boolean(cfg.token),
    schedule: normalizeSchedule(row?.schedule),
    directoryCacheMinutes: 30,
    createdAt: row?.createdAt || null,
    updatedAt: row?.updatedAt || null
  };
}

export async function ensureControlInitialized() {
  await fs.mkdir(CONTROL_DIR, {recursive:true, mode:0o750});
  await fs.mkdir(DOWNLOAD_DIR, {recursive:true, mode:0o750});
  const admin=await readJson(ADMIN_FILE, null);
  if (!admin) {
    const bootstrapPassword=String(env.ADMIN_PASSWORD||'123456');
    if (bootstrapPassword.length < 6) throw new Error('ADMIN_PASSWORD must be at least 6 chars for first bootstrap');
    const now=new Date().toISOString();
    await writeJson(ADMIN_FILE, {
      id:1,
      username:env.ADMIN_USERNAME || 'admin',
      email:env.ADMIN_EMAIL || null,
      passwordHash:await bcrypt.hash(bootstrapPassword, 12),
      role:'superadmin',
      status:'active',
      sessionVersion:1,
      createdAt:now,
      updatedAt:now,
      lastLoginAt:null
    });
  }
  if (!(await readJson(SETTINGS_FILE, null))) {
    await writeJson(SETTINGS_FILE, {
      site_name:'ZONOE',
      site_notice:'欢迎使用 ZONOE 下载站',
      hero_title:'探索更多可能，让优秀的应用触手可及'
    });
  }
  if (!(await readJson(SOURCES_FILE, null))) await writeJson(SOURCES_FILE, []);
}

export async function getAdminByUsername(username) {
  await ensureControlInitialized();
  const a=await readJson(ADMIN_FILE, null);
  return a && a.status==='active' && a.username===username ? a : null;
}

export async function getAdminById(id) {
  await ensureControlInitialized();
  const a=await readJson(ADMIN_FILE, null);
  return a && a.status==='active' && Number(a.id)===Number(id) ? a : null;
}

export async function touchAdminLogin(id) {
  const a=await getAdminById(id); if(!a) return;
  a.lastLoginAt=new Date().toISOString(); a.updatedAt=new Date().toISOString();
  await writeJson(ADMIN_FILE,a);
}

export async function updateAdminPassword(id, passwordHash) {
  const a=await getAdminById(id); if(!a) return null;
  a.passwordHash=passwordHash;
  a.sessionVersion=Number(a.sessionVersion||1)+1;
  a.updatedAt=new Date().toISOString();
  await writeJson(ADMIN_FILE,a);
  return a;
}

export async function getSettings() {
  await ensureControlInitialized();
  return readJson(SETTINGS_FILE, {});
}

export async function setSetting(key,value) {
  const s=await getSettings(); s[key]=value; await writeJson(SETTINGS_FILE,s); return s;
}

export async function listMysqlSources({withSecrets=false}={}) {
  await ensureControlInitialized();
  const rows=await readJson(SOURCES_FILE, []);
  if (!withSecrets) return rows.map(publicSource);
  return rows.map(row=>({...row, config:decryptJson(row.configEncrypted)}));
}

export async function getMysqlSource(id,{withSecrets=false}={}) {
  const rows=await listMysqlSources({withSecrets:true});
  const row=rows.find(x=>Number(x.id)===Number(id));
  if(!row) return null;
  return withSecrets ? row : publicSource(row);
}

export async function getMysqlSourceBySlug(slug,{withSecrets=false}={}) {
  const rows=await listMysqlSources({withSecrets:true});
  const row=rows.find(x=>x.slug===slug);
  if(!row) return null;
  return withSecrets ? row : publicSource(row);
}

export async function createMysqlSource(data) {
  await ensureControlInitialized();
  const rows=await readJson(SOURCES_FILE, []);
  const id=rows.reduce((m,x)=>Math.max(m,Number(x.id)||0),0)+1;
  const slug=cleanSlug(data.slug || data.name);
  if(rows.some(x=>x.slug===slug)) throw Object.assign(new Error('软件源 slug 已存在'),{code:'SOURCE_SLUG_EXISTS'});
  const now=new Date().toISOString();
  const cfg={host:data.host,port:Number(data.port||3306),database:data.database,username:data.username,password:data.password,table:data.table||'fa_category',writeStats:data.writeStats===true};
  const row={id,name:data.name,slug,enabled:data.enabled!==false,priority:Number(data.priority||100),configEncrypted:encryptJson(cfg),createdAt:now,updatedAt:now};
  rows.push(row); await writeJson(SOURCES_FILE,rows); return publicSource(row);
}

export async function updateMysqlSource(id,data) {
  await ensureControlInitialized();
  const rows=await readJson(SOURCES_FILE, []);
  const idx=rows.findIndex(x=>Number(x.id)===Number(id)); if(idx<0) return null;
  const row=rows[idx];
  const cfg=decryptJson(row.configEncrypted);
  if(data.name!==undefined) row.name=data.name;
  if(data.slug!==undefined){ const slug=cleanSlug(data.slug); if(rows.some((x,i)=>i!==idx&&x.slug===slug)) throw Object.assign(new Error('软件源 slug 已存在'),{code:'SOURCE_SLUG_EXISTS'}); row.slug=slug; }
  if(data.enabled!==undefined) row.enabled=!!data.enabled;
  if(data.priority!==undefined) row.priority=Number(data.priority||100);
  for(const k of ['host','database','username','table']) if(data[k]!==undefined) cfg[k]=data[k];
  if(data.port!==undefined) cfg.port=Number(data.port||3306);
  if(data.password) cfg.password=data.password;
  if(data.writeStats!==undefined) cfg.writeStats=!!data.writeStats;
  row.configEncrypted=encryptJson(cfg); row.updatedAt=new Date().toISOString(); rows[idx]=row;
  await writeJson(SOURCES_FILE,rows); return publicSource(row);
}

export async function deleteMysqlSource(id) {
  await ensureControlInitialized();
  const rows=await readJson(SOURCES_FILE, []);
  const next=rows.filter(x=>Number(x.id)!==Number(id));
  if(next.length===rows.length) return false;
  await writeJson(SOURCES_FILE,next); return true;
}

export async function getOpenListConfig({withSecret=false}={}) {
  await ensureControlInitialized();
  const row=await readJson(OPENLIST_FILE, null);
  if(!row) return withSecret ? null : publicOpenList(null);
  if(!withSecret) return publicOpenList(row);
  let config={};
  try { config=decryptJson(row.configEncrypted); } catch {}
  return {...row,config,schedule:normalizeSchedule(row.schedule)};
}

export async function saveOpenListConfig(data) {
  await ensureControlInitialized();
  const old=await readJson(OPENLIST_FILE, null);
  let oldCfg={};
  try { if(old?.configEncrypted) oldCfg=decryptJson(old.configEncrypted); } catch {}
  const token=String(data.token||oldCfg.token||'').trim();
  if(!token) throw Object.assign(new Error('首次配置 OpenList 必须填写只读 Token'),{code:'OPENLIST_TOKEN_REQUIRED'});
  const now=new Date().toISOString();
  const cfg={
    url:String(data.url??oldCfg.url??'').trim().replace(/\/+$/,''),
    token,
    publicPathPrefix:String(data.publicPathPrefix??oldCfg.publicPathPrefix??'/d/a/app/').trim() || '/d/a/app/',
    apiBasePath:String(data.apiBasePath??oldCfg.apiBasePath??'/').trim() || '/'
  };
  const row={
    enabled:data.enabled!==undefined?!!data.enabled:(old?.enabled!==false),
    schedule:normalizeSchedule(old?.schedule),
    configEncrypted:encryptJson(cfg),
    createdAt:old?.createdAt||now,
    updatedAt:now
  };
  await writeJson(OPENLIST_FILE,row);
  return publicOpenList(row);
}

export async function saveOpenListSchedule(data) {
  await ensureControlInitialized();
  const row=await readJson(OPENLIST_FILE, null);
  if(!row) throw Object.assign(new Error('请先保存 OpenList 配置'),{code:'OPENLIST_CONFIG_REQUIRED'});
  row.schedule=normalizeSchedule(data);
  row.updatedAt=new Date().toISOString();
  await writeJson(OPENLIST_FILE,row);
  return publicOpenList(row);
}

export async function readOpenListIpaCache() {
  await ensureControlInitialized();
  return readJson(IPA_CACHE_FILE,{version:2,files:{},apps:{},missingEntries:[],lastSync:null});
}

export async function writeOpenListIpaCache(value) {
  const normalized={version:2,files:value?.files||{},apps:value?.apps||{},missingEntries:Array.isArray(value?.missingEntries)?value.missingEntries:[],lastSync:value?.lastSync||null};
  await writeJson(IPA_CACHE_FILE,normalized);
  return normalized;
}

export async function readOpenListDirectoryCache() {
  await ensureControlInitialized();
  return readJson(OPENLIST_DIR_CACHE_FILE,{version:1,scopeKey:'',directories:{}});
}

export async function writeOpenListDirectoryCache(value) {
  const normalized={version:1,scopeKey:String(value?.scopeKey||''),directories:value?.directories||{}};
  await writeJson(OPENLIST_DIR_CACHE_FILE,normalized);
  return normalized;
}

export async function readOpenListTask() {
  await ensureControlInitialized();
  return readJson(OPENLIST_TASK_FILE,{state:'idle',stage:'idle',message:'',progress:{},updatedAt:null});
}

export async function writeOpenListTask(value) {
  const normalized={state:'idle',stage:'idle',message:'',progress:{},...value,updatedAt:new Date().toISOString()};
  await writeJson(OPENLIST_TASK_FILE,normalized);
  return normalized;
}

export async function appendDownloadEvent(event) {
  await ensureControlInitialized();
  const day=new Date().toISOString().slice(0,10);
  const file=path.join(DOWNLOAD_DIR,`${day}.jsonl`);
  await fs.appendFile(file, JSON.stringify(event)+'\n', {mode:0o600});
}

export async function countTodayDownloads() {
  const day=new Date().toISOString().slice(0,10);
  try { const text=await fs.readFile(path.join(DOWNLOAD_DIR,`${day}.jsonl`),'utf8'); return text.split('\n').filter(Boolean).length; }
  catch(e){ if(e?.code==='ENOENT') return 0; throw e; }
}

export { CONTROL_DIR, DOWNLOAD_DIR, IPA_CACHE_FILE, OPENLIST_DIR_CACHE_FILE, OPENLIST_TASK_FILE, normalizeSchedule };
