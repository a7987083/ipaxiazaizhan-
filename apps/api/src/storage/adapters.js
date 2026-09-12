import path from 'node:path';
import { env } from '../config/env.js';
import { decryptJson } from '../utils/crypto.js';

function assertHttpUrl(url){ const u=new URL(url); if(!['http:','https:'].includes(u.protocol)) throw new Error('unsupported protocol'); return u.toString(); }
function joinUrl(base,target){ if(/^https?:\/\//i.test(target)) return assertHttpUrl(target); const b=(base||'').replace(/\/$/,''); const t=String(target||'').replace(/^\//,''); return assertHttpUrl(`${b}/${t}`); }

class LocalAdapter {
  resolve(binding){
    const target=String(binding.target||'').replace(/\\/g,'/');
    if(!target || target.includes('..') || path.isAbsolute(target)) throw new Error('invalid local path');
    return {url:`/files/${target.split('/').map(encodeURIComponent).join('/')}`,sourceId:binding.source_id};
  }
}
class HttpAdapter { resolve(binding){ return {url:joinUrl(binding.base_url,binding.target),sourceId:binding.source_id}; } }
class OpenListAdapter {
  resolve(binding){
    const config=decryptJson(binding.config_encrypted);
    if(/^https?:\/\//i.test(binding.target)) return {url:assertHttpUrl(binding.target),sourceId:binding.source_id};
    const template=config.pathTemplate || '/d/{path}';
    const clean=String(binding.target||'').replace(/^\//,'');
    const encoded=clean.split('/').map(encodeURIComponent).join('/');
    let url=(binding.base_url||'').replace(/\/$/,'') + template.replace('{path}',encoded);
    if(config.query && typeof config.query==='object') {
      const u=new URL(url); for(const [k,v] of Object.entries(config.query)) u.searchParams.set(k,String(v)); url=u.toString();
    }
    return {url:assertHttpUrl(url),sourceId:binding.source_id};
  }
}

const adapters={local:new LocalAdapter(),http:new HttpAdapter(),cloud:new HttpAdapter(),cdn:new HttpAdapter(),s3:new HttpAdapter(),oss:new HttpAdapter(),r2:new HttpAdapter(),other:new HttpAdapter(),openlist:new OpenListAdapter()};
export function resolveBinding(binding){ const adapter=adapters[binding.type]; if(!adapter) throw new Error(`unknown source type ${binding.type}`); return adapter.resolve(binding); }
export function localAbsolutePath(target){ const base=path.resolve(env.LOCAL_STORAGE_DIR); const absolute=path.resolve(base,target); if(!absolute.startsWith(base+path.sep)) throw new Error('path traversal'); return absolute; }
