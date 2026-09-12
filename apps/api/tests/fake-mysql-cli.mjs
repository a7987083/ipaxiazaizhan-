#!/usr/bin/env node
import fs from 'node:fs';

const args=process.argv.slice(2);
const argValue=(flag)=>{const i=args.indexOf(flag);return i>=0?args[i+1]:''};
const db=argValue('--database') || '';
const sql=fs.readFileSync(0,'utf8').trim();
const datasets={
  source_a:[
    {id:1,name:'Alpha Game',nickname:'100',image:'https://img.example/a.png',keywords:'VIP A',description:'',createtime:1700000000,updatetime:1700001000,weigh:10,status:'normal',bt1a:'https://cdn.example/a.ipa',bt2a:'104857600',cs:20},
    {id:2,name:'Shared Name A',nickname:'2',image:'',keywords:'Source A',description:'',createtime:1700000001,updatetime:1700002000,weigh:20,status:'normal',bt1a:'https://cdn.example/a2.ipa',bt2a:'52428800',cs:5}
  ],
  source_b:[
    {id:1,name:'Beta Game',nickname:'300',image:'https://img.example/b.png',keywords:'VIP B',description:'',createtime:1700000002,updatetime:1700003000,weigh:30,status:'normal',bt1a:'https://cdn.example/b.ipa',bt2a:'209715200',cs:50},
    {id:3,name:'Gamma Tool',nickname:'9',image:'',keywords:'Utility',description:'',createtime:1700000003,updatetime:1700004000,weigh:40,status:'normal',bt1a:'nsk-sign://web?url=https://example.com',bt2a:'1048576',cs:2}
  ]
};
const rows=datasets[db]||[];
const hex=s=>Buffer.from(String(s??''),'utf8').toString('hex').toUpperCase();
if(/SELECT\s+1/i.test(sql)){console.log('1');process.exit(0)}
if(/COUNT\(\*\),COALESCE\(SUM\(cs\),0\)/i.test(sql)){console.log(`${rows.length}\t${rows.reduce((n,x)=>n+x.cs,0)}`);process.exit(0)}
if(/SELECT\s+COUNT\(\*\)/i.test(sql)){let r=rows;const m=sql.match(/0x([0-9a-f]+)\s+USING utf8mb4\)/i);if(m){const q=Buffer.from(m[1],'hex').toString('utf8').replaceAll('%','').toLowerCase();r=r.filter(x=>[x.name,x.nickname,x.keywords,x.description,x.bt1a].some(v=>String(v).toLowerCase().includes(q)))}console.log(String(r.length));process.exit(0)}
if(/SELECT\s+id,HEX\(name\)/i.test(sql)){
  let r=[...rows]; const idm=sql.match(/WHERE\s+id=(\d+)/i); if(idm)r=r.filter(x=>x.id===Number(idm[1]));
  const qm=sql.match(/0x([0-9a-f]+)\s+USING utf8mb4\)/i); if(qm){const q=Buffer.from(qm[1],'hex').toString('utf8').replaceAll('%','').toLowerCase();r=r.filter(x=>[x.name,x.nickname,x.keywords,x.description,x.bt1a].some(v=>String(v).toLowerCase().includes(q)))}
  if(/cs DESC/i.test(sql))r.sort((a,b)=>b.cs-a.cs); else if(/name ASC/i.test(sql))r.sort((a,b)=>a.name.localeCompare(b.name)); else if(/ASC,id ASC/i.test(sql))r.sort((a,b)=>a.updatetime-b.updatetime); else r.sort((a,b)=>b.updatetime-a.updatetime);
  const lm=sql.match(/LIMIT\s+(\d+)/i); if(lm)r=r.slice(0,Number(lm[1]));
  for(const x of r)console.log([x.id,hex(x.name),hex(x.nickname),hex(x.image),hex(x.keywords),hex(x.description),x.createtime,x.updatetime,x.weigh,hex(x.status),hex(x.bt1a),hex(x.bt2a),x.cs].join('\t'));
  process.exit(0)
}
if(/UPDATE\s+`?fa_category`?/i.test(sql)){process.exit(0)}
console.error(`unsupported fake mysql SQL: ${sql}`);process.exit(2);
