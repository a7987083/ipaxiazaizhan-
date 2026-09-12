import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { env } from '../config/env.js';

const candidates=[env.MYSQL_BIN,'/www/server/mysql/bin/mysql','/usr/local/mysql/bin/mysql','/usr/bin/mysql','/bin/mysql','mysql'].filter(Boolean);
let cachedBin='';

export function mysqlBinary(){
  if(cachedBin) return cachedBin;
  for(const p of candidates){
    if(p==='mysql' || fs.existsSync(p)){ cachedBin=p; return p; }
  }
  return 'mysql';
}

function decodeEscapedField(v){
  if(v==='NULL') return null;
  return v.replace(/\\([0btnrZ\\])/g,(_,c)=>({0:'\0',b:'\b',t:'\t',n:'\n',r:'\r',Z:'\x1a','\\':'\\'}[c]));
}

export function parseTsv(text){
  const lines=String(text||'').replace(/\r/g,'').split('\n').filter(Boolean);
  return lines.map(line=>line.split('\t').map(decodeEscapedField));
}

export function sqlText(value){
  const hex=Buffer.from(String(value??''),'utf8').toString('hex');
  return `CONVERT(0x${hex} USING utf8mb4)`;
}
export function sqlInt(value, fallback=0){ const n=Number(value); return Number.isFinite(n)?String(Math.trunc(n)):String(fallback); }
export function safeIdentifier(value, fallback='fa_category'){
  const v=String(value||fallback); if(!/^[A-Za-z0-9_]+$/.test(v)) throw new Error(`非法 MySQL 标识符: ${v}`); return `\`${v}\``;
}
export function fromHex(v){ if(v==null||v==='') return ''; try{return Buffer.from(v,'hex').toString('utf8')}catch{return ''} }

export async function runMysql(config, sql, {timeoutMs=10000}={}){
  const bin=mysqlBinary();
  const args=['--batch','--raw','--skip-column-names','--default-character-set=utf8mb4',`--connect-timeout=${Math.max(1,Math.ceil(timeoutMs/1000))}`,'-h',String(config.host||'127.0.0.1'),'-P',String(config.port||3306),'-u',String(config.username||'')];
  if(config.database) args.push('--database',String(config.database));
  return await new Promise((resolve,reject)=>{
    const child=spawn(bin,args,{env:{...process.env,MYSQL_PWD:String(config.password||'')},stdio:['pipe','pipe','pipe']});
    let out='',err=''; let killed=false;
    const timer=setTimeout(()=>{killed=true;child.kill('SIGKILL')},timeoutMs);
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data',d=>out+=d); child.stderr.on('data',d=>err+=d);
    child.on('error',e=>{clearTimeout(timer);reject(new Error(e.code==='ENOENT'?'服务器缺少 mysql 客户端命令':e.message))});
    child.on('close',code=>{clearTimeout(timer); if(killed)return reject(new Error('MySQL 连接/查询超时')); if(code!==0)return reject(new Error((err||`mysql exited ${code}`).trim().slice(0,600))); resolve(out)});
    child.stdin.end(`${sql.trim().replace(/;*$/,'')};\n`);
  });
}

export async function testMysqlSource(config){
  const out=await runMysql(config,'SELECT 1', {timeoutMs:8000});
  return parseTsv(out)?.[0]?.[0]==='1';
}
