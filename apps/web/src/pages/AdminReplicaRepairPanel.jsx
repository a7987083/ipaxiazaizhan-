import {useEffect,useMemo,useState} from 'react';
import {api} from '../lib/api';
import {Card,fmtBytes} from './AdminCorePanels';

function integrityText(status){return status==='md5_mismatch'?'MD5 不一致':status==='size_mismatch'?'大小不一致':status||'—'}

export default function AdminReplicaRepairPanel(){
  const[state,setState]=useState(null),[cfg,setCfg]=useState(null),[plan,setPlan]=useState(null),[target,setTarget]=useState(''),[note,setNote]=useState(''),[busy,setBusy]=useState(false);
  const load=async()=>{try{const r=await api.admin('/openlist/replicas');setState(r.data);setCfg(r.data?.config||null)}catch(e){setNote(e.message)}};
  useEffect(()=>{load()},[]);
  const writable=useMemo(()=>((cfg?.mounts||[]).filter(x=>x.enabled!==false&&x.writable)),[cfg]);
  const ready=!!(cfg?.enabled&&cfg?.allowCopy&&cfg?.allowQuarantine&&cfg?.allowRepair);
  const saveRepairPermission=async(on)=>{if(!cfg)return;setBusy(true);try{const next={...cfg,allowRepair:on};await api.admin('/openlist/replicas',{method:'PUT',body:JSON.stringify(next)});setCfg(next);setPlan(null);setNote(on?'已开启异常副本修复权限。仍要求副本复制、隔离权限同时开启。':'已关闭异常副本修复权限。')}catch(e){setNote(e.message)}finally{setBusy(false)}};
  const preview=async()=>{setBusy(true);setNote('正在重新对账并生成只读修复计划…');try{const targetStorageIds=target?[Number(target)]:[];const r=await api.admin('/openlist/replicas/repair-plan',{method:'POST',body:JSON.stringify({limit:20,targetStorageIds})});setPlan(r.data);setNote(`修复计划已生成：${r.data?.actions?.length||0} 个。这里只预览，不会移动或复制文件。`)}catch(e){setPlan(null);setNote(e.message)}finally{setBusy(false)}};
  const execute=async()=>{if(!plan?.actions?.length)return;const n=plan.actions.length;if(!confirm(`确认修复 ${n} 个异常副本？\n\n每个文件都会：\n1. 再次实时验证来源与异常目标\n2. 先同步改名隔离，再提交后台移动到隔离目录\n3. 从 MD5 已验证来源补回\n4. 进入副本任务继续核验\n\n不会永久删除 IPA。`))return;setBusy(true);try{const r=await api.admin('/openlist/replicas/repair',{method:'POST',body:JSON.stringify({limit:plan.limit,targetStorageIds:plan.targetStorageIds||[],planHash:plan.planHash})});setPlan(null);setNote(`修复已提交：隔离 ${r.data?.quarantined?.length||0} 个，补回 ${r.data?.repairedSubmitted?.length||0} 个，失败 ${r.data?.failed?.length||0} 个。跟踪批次 ${r.data?.trackingBatchId||'—'}；请到“副本任务”查看最终核验。`)}catch(e){setNote(e.message)}finally{setBusy(false)}};

  return <div className="admin-panel">
    <h2>异常副本修复</h2>
    <p>只处理对账中已经判定为 <b>MD5 不一致</b> 或 <b>大小不一致</b> 的副本。修复来源必须是另一个 <b>MD5 已验证</b> 的实体盘副本。系统不会覆盖异常文件：先同步改名为不可被副本扫描识别的隔离名，立即释放原文件名；再提交后台移动到隔离目录并补回正确副本，最后交给“副本任务”独立核验。</p>
    {note&&<div className="toast">{note}</div>}
    {!cfg?<p>正在读取副本配置…</p>:<>
      <div className="stat-grid"><Card t="副本管理" v={cfg.enabled?1:0}/><Card t="允许复制" v={cfg.allowCopy?1:0}/><Card t="允许隔离" v={cfg.allowQuarantine?1:0}/><Card t="允许异常修复" v={cfg.allowRepair?1:0}/></div>
      <div className="admin-panel"><h3>安全权限</h3><p>异常修复额外增加独立开关，默认关闭。只有“副本管理 + 允许副本复制 + 允许移动到隔离区 + 允许异常副本修复”全部开启时才能执行。</p><div className="actions"><button className={cfg.allowRepair?'':'primary'} disabled={busy||cfg.allowRepair} onClick={()=>saveRepairPermission(true)}>开启异常修复</button><button disabled={busy||!cfg.allowRepair} onClick={()=>saveRepairPermission(false)}>关闭异常修复</button></div>{!ready&&<p><small>当前尚未满足全部权限。副本复制/隔离权限请在“云盘副本”页面开启并保存。</small></p>}</div>
      <div className="admin-panel"><h3>修复计划</h3><div className="form-grid"><label>目标网盘<select value={target} onChange={e=>setTarget(e.target.value)}><option value="">全部可写实体盘</option>{writable.map(x=><option value={x.storageId} key={x.storageId}>{x.label||x.mountPath}</option>)}</select></label></div><div className="actions"><button className="primary" disabled={busy||!ready} onClick={preview}>重新对账并预览修复（最多 20 个）</button><button disabled={busy} onClick={load}>刷新配置</button></div></div>
    </>}

    {plan&&<div className="admin-panel"><h3>异常副本修复计划</h3><p><b>当前仍未执行任何写操作。</b> Plan Hash 同时绑定异常目标的当前 MD5/大小、正确来源、目标目录和期望内容；执行时还会对来源和目标逐个做实时复检，状态变化就跳过。</p><div className="stat-grid"><Card t="计划修复" v={plan.summary?.actions||0}/><Card t="MD5 异常" v={plan.summary?.md5Mismatches||0}/><Card t="大小异常" v={plan.summary?.sizeMismatches||0}/><Card t="无已验证来源" v={plan.summary?.skippedNoVerifiedSource||0}/></div><div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr><th align="left">IPA</th><th align="left">正确来源 → 异常目标</th><th align="left">异常</th><th align="left">期望 / 当前</th></tr></thead><tbody>{(plan.actions||[]).map((x,i)=><tr key={`${x.relativePath}-${x.targetStorageId}-${i}`} style={{borderTop:'1px solid #e5e7eb',verticalAlign:'top'}}><td style={{padding:8,wordBreak:'break-all'}}>{x.relativePath}</td><td style={{padding:8}}><b>{x.sourceLabel}</b> → <b>{x.targetLabel}</b><br/><small>来源 MD5 已验证</small></td><td style={{padding:8}}>{integrityText(x.targetStatus)}</td><td style={{padding:8}}><small>期望 MD5 {x.expectedMd5||'—'}<br/>当前 MD5 {x.targetActualMd5||'—'}<br/>期望 {fmtBytes(x.expectedSize)} / 当前 {fmtBytes(x.targetActualSize)}</small></td></tr>)}</tbody></table></div>{!plan.actions?.length&&<p>没有可安全自动修复的异常。没有 MD5 已验证来源的项目不会进入计划。</p>}<div className="actions"><button className="primary" disabled={busy||!plan.actions?.length} onClick={execute}>确认隔离并补回</button><button disabled={busy} onClick={()=>setPlan(null)}>取消计划</button></div></div>}
  </div>;
}
