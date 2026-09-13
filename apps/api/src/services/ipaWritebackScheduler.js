import { autoWritebackEnabledSources } from './ipaWritebackService.js';

let timer=null;
let running=false;

async function tick(){
  if(running) return;
  running=true;
  try{
    const results=await autoWritebackEnabledSources({limitPerSource:50});
    const updated=results.reduce((n,x)=>n+Number(x?.updated||0),0);
    const failed=results.reduce((n,x)=>n+Number(x?.failed||0),0);
    if(updated||failed) console.log(`IPA writeback: updated=${updated} failed=${failed}`);
  }catch(e){
    console.error('IPA writeback scheduler:',e?.message||e);
  }finally{ running=false; }
}

export async function startIpaWritebackScheduler(){
  if(timer) return;
  timer=setInterval(tick,60_000);
  timer.unref?.();
}
