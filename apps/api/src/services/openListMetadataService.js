import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listMysqlSources, getOpenListConfig, readOpenListIpaCache, writeOpenListIpaCache } from '../storage/controlStore.js';
import { fromHex, parseTsv, runMysql, safeIdentifier } from './mysqlCli.js';

const PARSER = fileURLToPath(new URL('../../../../scripts/ipa-range-info.py', import.meta.url));
const PAGE_SIZE = 500;

function cleanBasePath(v='/') {
  let s=String(v||'/').trim();
  if(!s.startsWith('/')) s=`/${s}`;
  while(s.includes('//')) s=s.replaceAll('//','/');
  while(s.length>1 && s.endsWith('/')) s=s.slice(0,-1);
  return s || '/';
}
function cleanPrefix(v='/d/a/app/') {
  let s=String(v||'/d/a/app/').trim();
  try { s=decodeURIComponent(s); } catch {}
  if(!s.startsWith('/')) s=`/${s}`;
  while(s.includes('//')) s=s.replaceAll('//','/');
  if(!s.endsWith('/')) s+='/' ;
  return s;
}
function joinApiPath(base,relative) {
  let rel=String(relative||''); while(rel.startsWith('/')) rel=rel.slice(1);
  const parts=rel.split('/').filter(Boolean);
  if(parts.some(x=>x==='..')) return null;
  const out=path.posix.join(cleanBasePath(base),...parts);
  return out.startsWith('/')?out:`/${out}`;
}

export function publicUrlToApiPath(rawUrl, config) {
  try {
    const base=new URL(config.url);
    const u=new URL(String(rawUrl||'').trim());
    if(u.hostname.toLowerCase()!==base.hostname.toLowerCase()) return null;
    let pathname=u.pathname;
    try { pathname=decodeURIComponent(pathname); } catch {}
    const prefix=cleanPrefix(config.publicPathPrefix);
    if(!pathname.startsWith(prefix)) return null;
    return joinApiPath(config.apiBasePath,pathname.slice(prefix.length));
  } catch { return null; }
}

export function metadataChanged(oldFile,nextFile) {
  if(!oldFile) return true;
  const oldMd5=String(oldFile.md5||'').toUpperCase();
  const newMd5=String(nextFile.md5||'').toUpperCase();
  if(oldMd5 && newMd5) return oldMd5!==newMd5;
  return Number(oldFile.size||0)!==Number(nextFile.size||0) || String(oldFile.modified||'')!==String(nextFile.modified||'');
}

function hashMd5(item) {
  if(item?.hash_info?.md5) return String(item.hash_info.md5).toUpperCase();
  try { const j=JSON.parse(item?.hashinfo||'{}'); return String(j?.md5||'').toUpperCase(); } catch { return ''; }
}

async function openListJson(config, apiPath, body, timeoutMs=20000) {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try {
    let baseUrl=String(config.url); while(baseUrl.endsWith('/')) baseUrl=baseUrl.slice(0,-1);
    const res=await fetch(`${baseUrl}${apiPath}`,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':config.token,'User-Agent':'zonoe-openlist-metadata/1.0'},
      body:JSON.stringify(body),signal:controller.signal
    });
    const json=await res.json().catch(()=>null);
    if(!res.ok || !json || json.code!==200) throw new Error(json?.message||`OpenList HTTP ${res.status}`);
    return json.data;
  } finally { clearTimeout(timer); }
}

async function listDirectory(config,dir) {
  const files=new Map();
  let page=1,total=0,seen=0;
  while(true) {
    const data=await openListJson(config,'/api/fs/list',{path:dir,password:'',page,per_page:PAGE_SIZE,refresh:false});
    const content=Array.isArray(data?.content)?data.content:[];
    total=Number(data?.total||content.length||0); seen+=content.length;
    for(const item of content) {
      if(item?.is_dir) continue;
      const full=path.posix.join(dir==='/'?'/':dir,String(item?.name||''));
      files.set(full,{
        name:String(item?.name||''),
        size:Number(item?.size||0),
        modified:String(item?.modified||''),
        created:String(item?.created||''),
        md5:hashMd5(item)
      });
    }
    if(content.length===0 || seen>=total) break;
    page+=1;
    if(page>1000) throw new Error('OpenList 分页数量异常');
  }
  return files;
}

async function readReferencedIpas(config) {
  const sources=(await listMysqlSources({withSecrets:true})).filter(x=>x.enabled!==false);
  const refs=[]; const sourceErrors=[]; let ignored=0;
  for(const source of sources) {
    try {
      const table=safeIdentifier(source.config.table||'fa_category');
      const sql=`SELECT id,HEX(bt1a) FROM ${table} WHERE status IN ('normal','published','1','active') AND bt1a IS NOT NULL AND bt1a<>''`;
      const rows=parseTsv(await runMysql(source.config,sql,{timeoutMs:20000}));
      for(const [id,urlHex] of rows) {
        const rawUrl=fromHex(urlHex).trim();
        const apiPath=publicUrlToApiPath(rawUrl,config);
        if(!apiPath){ ignored+=1; continue; }
        refs.push({appKey:`${source.slug}:${Number(id)}`,sourceSlug:source.slug,legacyId:Number(id),apiPath});
      }
    } catch(e) {
      sourceErrors.push({source:source.slug,message:e?.message||'读取 bt1a 失败'});
    }
  }
  return {refs,ignored,sourceErrors};
}

async function parseWithPython(rawUrl,size,timeoutMs=45000) {
  return await new Promise((resolve,reject)=>{
    const child=spawn('python3',[PARSER],{stdio:['pipe','pipe','pipe']});
    let out='',err='',done=false;
    const finish=(fn,value)=>{if(done)return;done=true;clearTimeout(timer);fn(value)};
    const timer=setTimeout(()=>{child.kill('SIGKILL');finish(reject,new Error('IPA Range 解析超时'))},timeoutMs);
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data',d=>out+=d); child.stderr.on('data',d=>err+=d);
    child.on('error',e=>finish(reject,e));
    child.on('close',code=>{
      if(done)return;
      try {
        const line=String(out||'').trim().split('\n').filter(Boolean).at(-1)||'';
        const data=JSON.parse(line);
        if(code!==0 || data?.ok!==true) return finish(reject,new Error(data?.error||err.trim()||`parser exited ${code}`));
        const safe={
          name:String(data.name||''),version:String(data.version||''),build:String(data.build||''),
          bundle_id:String(data.bundle_id||''),minimum_ios:String(data.minimum_ios||''),executable:String(data.executable||'')
        };
        finish(resolve,safe);
      } catch(e) { finish(reject,new Error(err.trim()||e.message||'IPA parser output invalid')); }
    });
    child.stdin.end(JSON.stringify({url:rawUrl,size:Number(size||0)}));
  });
}

async function parseOne(config,apiPath,file) {
  const detail=await openListJson(config,'/api/fs/get',{path:apiPath,password:''},15000);
  const rawUrl=String(detail?.raw_url||'');
  if(!rawUrl) throw new Error('OpenList 未返回 raw_url');
  const size=Number(detail?.size||file.size||0);
  return await parseWithPython(rawUrl,size);
}

function publicConfig(configRow) {
  if(!configRow) return {enabled:false,url:'',publicPathPrefix:'/d/a/app/',apiBasePath:'/',tokenConfigured:false};
  const c=configRow.config||{};
  return {enabled:configRow.enabled!==false,url:c.url||'',publicPathPrefix:c.publicPathPrefix||'/d/a/app/',apiBasePath:c.apiBasePath||'/',tokenConfigured:Boolean(c.token),updatedAt:configRow.updatedAt||null};
}

export async function testOpenListConnection() {
  const row=await getOpenListConfig({withSecret:true});
  if(!row?.config?.url || !row?.config?.token) throw new Error('请先保存 OpenList URL 和 Token');
  const dir=cleanBasePath(row.config.apiBasePath||'/');
  const data=await openListJson(row.config,'/api/fs/list',{path:dir,password:'',page:1,per_page:1,refresh:false});
  return {connected:true,total:Number(data?.total||0),provider:String(data?.provider||'unknown')};
}

export async function syncOpenListIpaMetadata({parseLimit=0}={}) {
  parseLimit=Math.max(0,Math.min(20,Number(parseLimit)||0));
  const row=await getOpenListConfig({withSecret:true});
  if(!row?.config?.url || !row?.config?.token) throw new Error('请先配置 OpenList');
  if(row.enabled===false) throw new Error('OpenList 元数据同步已停用');
  const config=row.config;
  const old=await readOpenListIpaCache();
  const {refs,ignored,sourceErrors}=await readReferencedIpas(config);
  const dirs=[...new Set(refs.map(x=>path.posix.dirname(x.apiPath)||'/'))].sort();
  const remote=new Map();
  for(const dir of dirs) {
    const files=await listDirectory(config,dir);
    for(const [k,v] of files) remote.set(k,v);
  }

  const apps={}; const files={}; const expected=[...new Set(refs.map(x=>x.apiPath))];
  let newFiles=0,changedFiles=0,unchangedFiles=0,missingFiles=0;
  for(const ref of refs) apps[ref.appKey]=ref.apiPath;
  for(const apiPath of expected) {
    const next=remote.get(apiPath);
    const prev=old.files?.[apiPath];
    if(!next) {
      missingFiles+=1;
      if(prev) files[apiPath]={...prev,missing:true,lastSeenAt:prev.lastSeenAt||null};
      continue;
    }
    const changed=metadataChanged(prev,next);
    if(!prev) newFiles+=1; else if(changed) changedFiles+=1; else unchangedFiles+=1;
    files[apiPath]={
      ...(changed?{}:prev||{}),
      name:next.name,size:next.size,modified:next.modified,created:next.created,md5:next.md5,
      missing:false,lastSeenAt:new Date().toISOString()
    };
    if(changed) {
      files[apiPath].parsed=null;
      files[apiPath].parsedMd5='';
      files[apiPath].parseError='';
      files[apiPath].parsedAt=null;
    }
  }

  let candidates=expected.filter(p=>files[p]&&!files[p].missing&&(!files[p].parsed || (files[p].md5&&files[p].parsedMd5!==files[p].md5)));
  let parsedNow=0,parseFailedNow=0;
  for(const apiPath of candidates.slice(0,parseLimit)) {
    try {
      const parsed=await parseOne(config,apiPath,files[apiPath]);
      files[apiPath].parsed=parsed;
      files[apiPath].parsedMd5=files[apiPath].md5||'';
      files[apiPath].parsedAt=new Date().toISOString();
      files[apiPath].parseError='';
      parsedNow+=1;
    } catch(e) {
      files[apiPath].parseError=String(e?.message||'解析失败').slice(0,500);
      files[apiPath].lastParseAttemptAt=new Date().toISOString();
      parseFailedNow+=1;
    }
  }
  candidates=expected.filter(p=>files[p]&&!files[p].missing&&(!files[p].parsed || (files[p].md5&&files[p].parsedMd5!==files[p].md5)));
  const lastSync={
    finishedAt:new Date().toISOString(),databaseRefs:refs.length,ignoredRefs:ignored,uniqueFiles:expected.length,
    foundFiles:expected.length-missingFiles,missingFiles,newFiles,changedFiles,unchangedFiles,
    parsedNow,parseFailedNow,pendingParse:candidates.length,sourceErrors
  };
  await writeOpenListIpaCache({version:1,files,apps,lastSync});
  return lastSync;
}

export async function getOpenListIpaStatus() {
  const [cfg,cache]=await Promise.all([getOpenListConfig(),readOpenListIpaCache()]);
  const values=Object.values(cache.files||{});
  const parsed=values.filter(x=>x?.parsed).length;
  const failed=values.filter(x=>x?.parseError).length;
  const pending=values.filter(x=>!x?.missing&&(!x?.parsed||(x?.md5&&x?.parsedMd5!==x?.md5))).length;
  const sample=values.filter(x=>x?.parsed).sort((a,b)=>String(b.parsedAt||'').localeCompare(String(a.parsedAt||''))).slice(0,10).map(x=>({
    name:x.parsed?.name||x.name||'',version:x.parsed?.version||'',build:x.parsed?.build||'',bundle_id:x.parsed?.bundle_id||'',minimum_ios:x.parsed?.minimum_ios||'',size:Number(x.size||0),modified:x.modified||'',md5:x.md5||'',parsedAt:x.parsedAt||''
  }));
  return {config:cfg,cache:{files:values.length,parsed,pending,failed,lastSync:cache.lastSync||null,sample}};
}

export async function getCachedIpaMetadata(appKey) {
  const cache=await readOpenListIpaCache();
  const apiPath=cache.apps?.[String(appKey||'')];
  const file=apiPath?cache.files?.[apiPath]:null;
  if(!file || file.missing) return null;
  return {
    size:Number(file.size||0)||null,
    modified:file.modified||null,
    parsed_at:file.parsedAt||null,
    name:file.parsed?.name||'',version:file.parsed?.version||'',build:file.parsed?.build||'',
    bundle_id:file.parsed?.bundle_id||'',minimum_ios:file.parsed?.minimum_ios||'',verified:Boolean(file.md5)
  };
}

export { cleanBasePath, cleanPrefix };
