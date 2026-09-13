import {useEffect,useState} from 'react';
import {api} from '../lib/api';

export default function AdminUpdaterPanel(){
  const[info,setInfo]=useState(null),[channel,setChannel]=useState('preview'),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const load=async(silent=false)=>{
    if(!silent)setLoading(true);
    try{
      const r=await api.admin('/system/update');
      setInfo(r.data);
      setChannel(c=>r.data?.channels?.[c]?c:(r.data?.defaultChannel||'preview'));
      setError('');
    }catch(e){if(!silent)setError(e.message)}
    finally{if(!silent)setLoading(false)}
  };
  useEffect(()=>{load()},[]);
  useEffect(()=>{
    if(!['queued','running'].includes(info?.status?.state))return;
    const id=setInterval(()=>load(true),2500);
    return()=>clearInterval(id);
  },[info?.status?.state]);
  const selected=info?.channels?.[channel]||null;
  const state=info?.status?.state||'idle';
  const running=['queued','running'].includes(state);
  const start=async()=>{
    if(!selected?.hasUpdate)return;
    if(!window.confirm(`确定从${selected.label}一键更新到 ${selected.latestVersion}？更新前会自动备份，失败会自动回滚。`))return;
    setError('');
    try{
      const r=await api.admin('/system/update',{method:'POST',body:JSON.stringify({channel})});
      setInfo(x=>({...x,status:r.data}));
      setTimeout(()=>load(true),1000);
    }catch(e){setError(e.message)}
  };
  const stable=info?.channels?.stable,preview=info?.channels?.preview;
  const label=running?'正在更新…':selected?.hasUpdate?`一键更新到 ${selected.latestVersion}`:selected?.localAhead?'当前版本更高，禁止降级':'该通道已是最新';
  return <div className="admin-panel"><h2>GitHub 在线更新</h2><p>系统会同时检查稳定版和预览版。稳定版来自 GitHub Stable Release；预览版固定跟随 <code>{info?.previewRef||'feature/baota-native-deploy-v1'}</code> 最近一次通过 CI 的构建。两个通道都只允许向更高版本前进。</p>{loading&&<p>正在检查 Stable 和 Preview...</p>}{error&&<div className="toast">{error}</div>}{info&&<><div className="row"><b>当前版本</b><span>{info.currentVersion}</span></div><div className="row"><b>Stable 最新</b><span>{stable?.latestVersion||'暂未获取'}{stable?.error?` · ${stable.error}`:''}</span></div><div className="row"><b>Preview 最新</b><span>{preview?.latestVersion||'暂未获取'}{preview?.error?` · ${preview.error}`:''}</span></div><div className="row"><b>更新通道</b><select value={channel} disabled={running} onChange={e=>setChannel(e.target.value)}><option value="preview">预览版 Preview</option><option value="stable">稳定版 Stable Release</option></select></div><div className="row"><b>目标版本</b><span>{selected?.latestVersion||'暂未获取'}</span></div><div className="row"><b>任务状态</b><span>{state} · {info.status?.message||'—'}{info.status?.channel?` · ${info.status.channel}`:''}</span></div>{selected?.localAhead&&<p>当前版本高于所选通道，系统会阻止降级。</p>}{selected?.notes&&<div style={{margin:'16px 0',whiteSpace:'pre-wrap',maxHeight:240,overflow:'auto'}}><b>更新说明</b><p>{selected.notes}</p></div>}<div className="actions"><button onClick={()=>load()} disabled={running}>检查两个通道</button><button className="primary" onClick={start} disabled={running||!selected?.hasUpdate}>{label}</button></div>{state==='success'&&<p>更新完成，当前版本会自动刷新；如页面静态资源已更新，请再刷新一次浏览器。</p>}{state==='failed'&&<p className="error">{info.status?.message||'更新失败'}。服务器日志：data/update-runtime/admin-update.log</p>}</>}</div>;
}
