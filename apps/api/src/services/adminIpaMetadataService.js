import { listMysqlSources } from '../storage/controlStore.js';
import { fromHex, parseTsv, runMysql, safeIdentifier, sqlInt } from './mysqlCli.js';
import { listOpenListParseResults } from './openListMetadataService.js';

async function loadDownloadUrls(items=[]){
  const sources=await listMysqlSources({withSecrets:true});
  const sourceMap=new Map(sources.map(x=>[x.slug,x]));
  const groups=new Map();
  for(const item of items){
    if(!item?.sourceSlug||!item?.legacyId)continue;
    if(!groups.has(item.sourceSlug))groups.set(item.sourceSlug,[]);
    groups.get(item.sourceSlug).push(item);
  }
  const urls=new Map();
  for(const [slug,group] of groups){
    const source=sourceMap.get(slug);
    if(!source)continue;
    const ids=[...new Set(group.map(x=>Number(x.legacyId)).filter(Number.isFinite))];
    if(!ids.length)continue;
    try{
      const table=safeIdentifier(source.config.table||'fa_category');
      const sql=`SELECT id,HEX(CAST(bt1a AS CHAR)) FROM ${table} WHERE id IN (${ids.map(x=>sqlInt(x)).join(',')})`;
      const rows=parseTsv(await runMysql(source.config,sql,{timeoutMs:15000}));
      for(const [id,urlHex] of rows)urls.set(`${slug}:${Number(id)}`,fromHex(urlHex).trim());
    }catch(e){
      console.error(`Admin IPA download URL ${slug}:`,e?.message||e);
    }
  }
  return urls;
}

export async function listAdminOpenListParseResults(params={}){
  const result=await listOpenListParseResults(params);
  const urls=await loadDownloadUrls(result.items||[]);
  return {
    ...result,
    items:(result.items||[]).map(item=>({
      ...item,
      downloadUrl:urls.get(String(item.appKey||''))||''
    }))
  };
}
