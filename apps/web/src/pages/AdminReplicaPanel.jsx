import {useEffect,useMemo,useState} from 'react';
import {api} from '../lib/api';
import {Card,fmtBytes} from './AdminCorePanels';

const emptyCfg={enabled:false,allowCopy:false,allowRename:false,allowQuarantine:false,quarantineFolder:'.zonoe-quarantine',aliasMountPath:'',mounts:[]};
const PAGE_SIZE=100;

function pageOf(list,page){
  const rows=Array.isArray(list)?list:[];
  const pages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));
  const safe=Math.min(pages,Math.max(1,Number(page)||1));
  return {rows:rows.slice((safe-1)*PAGE_SIZE,safe*PAGE_SIZE),page:safe,pages,total:rows.length};
}
function Pager({value,onChange}){
  if(!value||value.total<=PAGE_SIZE)return null;
  return <div className="actions"><button disabled={value.page<=1} onClick={()=>onChange(value.page-1)}>上一页</button><span>第 {value.page}/{value.pages} 页 · 共 {value.total} 条 · 每页 {PAGE_SIZE} 条</span><button disabled={value.page>=value.pages} onClick={()=>onChange(value.page+1)}>下一页</button></div>;
}
function cleanPublicRoot(base,mountPath){
  const b=String(base||'').replace(/\/+$/,'');
  const m=String(mountPath||'').trim();
  if(!b||!m)return '';
  return `${b}/d${m==='/'?'':m}/`;
}
function ageText(ms){
  const n=Number(ms);if(!Number.isFinite(n)||n<0)return '未知';
  if(n<60_000)return '刚刚';
  if(n<3_600_000)return `${Math.floor(n/60_000)} 分钟前`;
  return `${Math.floor(n/3_600_000)} 小时前`;
}
function integrityText(status){
  if(status==='md5_mismatch')return 'MD5 不一致';
  if(status==='size_mismatch')return '大小不一致';
  if(status==='verified')return 'MD5 已验证';
  if(status==='unverified')return '无 Hash，未验证';
  return '缺失';
}
function sourceConfidence(status){return status==='verified'?'MD5 已验证':'未验证来源';}

export default function AdminReplicaPanel(){
  const[state,setState]=useState(null),[cfg,setCfg]=useState(emptyCfg),[preview,setPreview]=useState(null),[syncPlan,setSyncPlan]=useState(null),[note,setNote]=useState(''),[busy,setBusy]=useState(false);
  const[expanded,setExpanded]=useState({}),[extraPages,setExtraPages]=useState({}),[missingPages,setMissingPages]=useState({}),[issuePages,setIssuePages]=useState({});

  const applyPreview=(p)=>{
    setPreview(p||null);setSyncPlan(null);setExtraPages({});setMissingPages({});setIssuePages({});
    if(p?.mounts?.length)setExpanded(x=>Object.keys(x).length?x:Object.fromEntries(p.mounts.map((m,i)=>[Number(m.storageId),p.mounts.length===1||i===0])));
  };
  const load=async()=>{try{const r=await api.admin('/openlist/replicas');setState(r.data);setCfg({...emptyCfg,...(r.data?.config||{}),mounts:r.data?.config?.mounts||[]});if(r.data?.lastPreview)applyPreview(r.data.lastPreview)}catch(e){setNote(e.message)}};
  useEffect(()=>{load()},[]);

  const mounts=useMemo(()=>new Map((cfg.mounts||[]).map(x=>[Number(x.storageId),x])),[cfg.mounts]);
  const storageRows=(state?.storages||[]).map(s=>({s,m:mounts.get(Number(s.id))}));
  const enabledMounts=(cfg.mounts||[]).filter(x=>x.enabled!==false);
  const updateMount=(s,patch)=>{
    const current=mounts.get(Number(s.id))||{storageId:s.id,mountPath:s.mountPath,rootPath:s.mountPath,label:s.remark||s.mountPath,enabled:true,writable:false};
    const next={...current,...patch,storageId:s.id,mountPath:s.mountPath};
    setCfg(x=>{
      const rows=x.mounts||[],found=rows.some(m=>Number(m.storageId)===Number(s.id));
      return {...x,mounts:found?rows.map(m=>Number(m.storageId)===Number(s.id)?next:m):[...rows,next]};
    });
  };
  const toggleStorage=(s,on)=>{if(on)updateMount(s,{enabled:true});else setCfg(x=>({...x,mounts:(x.mounts||[]).filter(m=>Number(m.storageId)!==Number(s.id))}))};
  const movePriority=(storageId,delta)=>setCfg(x=>{
    const rows=[...(x.mounts||[])],idx=rows.findIndex(m=>Number(m.storageId)===Number(storageId)),to=idx+delta;
    if(idx<0||to<0||to>=rows.length)return x;
    [rows[idx],rows[to]]=[rows[to],rows[idx]];
    return {...x,mounts:rows};
  });

  const save=async()=>{setBusy(true);setNote('');try{await api.admin('/openlist/replicas',{method:'PUT',body:JSON.stringify(cfg)});setPreview(null);setSyncPlan(null);setNote('云盘副本配置已保存；旧对账和网盘快照已失效，请重新对账。');await load()}catch(e){setNote(e.message)}finally{setBusy(false)}};
  const runPreview=async({forceRefresh=false,storageIds=[]}={})=>{setBusy(true);setNote(forceRefresh?'正在刷新指定网盘目录…':'正在对账；30 分钟内优先使用 ZONOE 网盘快照…');try{const r=await api.admin('/openlist/replicas/preview',{method:'POST',body:JSON.stringify({forceRefresh,storageIds})});applyPreview(r.data);const s=r.data?.apiStats||{};setNote(`对账完成 · OpenList 请求 ${s.openListRequests||0} · 快照命中 ${s.snapshotHits||0} 个盘 · 实际重扫 ${s.remoteMountScans||0} 个盘。`)}catch(e){setNote(e.message)}finally{setBusy(false)}};
  const planSync=async(targetStorageIds=[])=>{setBusy(true);setNote('正在生成补齐计划，不会执行复制…');try{const r=await api.admin('/openlist/replicas/sync-plan',{method:'POST',body:JSON.stringify({limit:20,targetStorageIds})});setSyncPlan(r.data);setNote(`计划已生成：${r.data?.actions?.length||0} 个复制任务。请确认“来源盘 → 目标盘”后再执行。`)}catch(e){setNote(e.message)}finally{setBusy(false)}};
  const executePlan=async()=>{if(!syncPlan)return;if(!confirm(`确认执行当前 ${syncPlan.actions?.length||0} 个“来源盘 → 目标盘”复制任务？`))return;setBusy(true);try{const r=await api.admin('/openlist/replicas/sync',{method:'POST',body:JSON.stringify({limit:syncPlan.limit,targetStorageIds:syncPlan.targetStorageIds||[],planHash:syncPlan.planHash})});setSyncPlan(null);setNote(`已提交 ${r.data.queued?.length||0} 个复制任务，提交失败 ${r.data.failed?.length||0} 个。跟踪批次 ${r.data.trackingBatchId||'—'}；ZONOE 会自动核验目标文件，整批结束后只刷新相关目标盘。请在左侧“副本任务”查看实时状态。`)}catch(e){setNote(e.message)}finally{setBusy(false)}};
  const rename=async(storageId,x)=>{if(!confirm(`确认把 ${x.fromRelative} 改名为 ${x.toRelative}？此建议来自相同 MD5。`))return;setBusy(true);try{const r=await api.admin('/openlist/replicas/rename',{method:'POST',body:JSON.stringify({storageId,fromRelative:x.fromRelative,toRelative:x.toRelative})});if(r.data?.preview)applyPreview(r.data.preview);setNote('名称修复完成；仅刷新了受影响网盘，没有全盘重扫。')}catch(e){setNote(e.message)}finally{setBusy(false)}};
  const quarantine=async(storageId,relativePath)=>{if(!confirm(`把多余 IPA 移到隔离区？\n${relativePath}\n\n不会永久删除。`))return;setBusy(true);try{const r=await api.admin('/openlist/replicas/quarantine',{method:'POST',body:JSON.stringify({items:[{storageId,relativePath}]})});if(r.data?.preview)applyPreview(r.data.preview);setNote('已移动到隔离区；仅刷新了受影响网盘，没有全盘重扫。')}catch(e){setNote(e.message)}finally{setBusy(false)}};
  const copyText=async(text,label='内容')=>{try{await navigator.clipboard.writeText(text);setNote(`${label}已复制`)}catch{setNote('浏览器未允许复制，请手动选择复制')}};

  const aliases=state?.alias?.candidates||[],pAlias=preview?.alias?.preferred||state?.alias?.preferred;
  const aliasPaths=enabledMounts.map(x=>x.rootPath).filter(Boolean),aliasPathsText=aliasPaths.join('\n');
  const aliasPublicRoot=cleanPublicRoot(state?.openListUrl,cfg.aliasMountPath);
  const setAllExpanded=(on)=>setExpanded(Object.fromEntries((preview?.mounts||[]).map(m=>[Number(m.storageId),on])));
  const stats=preview?.apiStats||{};

  return <div className="admin-panel">
    <h2>云盘副本管理</h2>
    <p>数据库下载地址是期望清单；实体网盘保存副本；OpenList Alias 负责最终下载分流。ZONOE 只调用 OpenList 文件操作 API，不中转 IPA 数据。网盘目录快照默认保留 30 分钟，对账优先读快照，避免频繁请求 OpenList。</p>
    {note&&<div className="toast">{note}</div>}
    {state?.storageError&&<div className="toast">无法读取 OpenList 挂载列表：{state.storageError}。请使用具备存储管理权限的 OpenList 程序令牌。</div>}

    <div className="form-grid"><label>启用副本管理<input type="checkbox" checked={!!cfg.enabled} onChange={e=>setCfg({...cfg,enabled:e.target.checked})}/></label><label>允许副本复制<input type="checkbox" checked={!!cfg.allowCopy} onChange={e=>setCfg({...cfg,allowCopy:e.target.checked})}/></label><label>允许名称修复<input type="checkbox" checked={!!cfg.allowRename} onChange={e=>setCfg({...cfg,allowRename:e.target.checked})}/></label><label>允许移动到隔离区<input type="checkbox" checked={!!cfg.allowQuarantine} onChange={e=>setCfg({...cfg,allowQuarantine:e.target.checked})}/></label><label>隔离目录名<input value={cfg.quarantineFolder||''} onChange={e=>setCfg({...cfg,quarantineFolder:e.target.value})}/></label></div>

    <div className="admin-panel"><h3>OpenList 挂载网盘</h3><p>勾选真正保存 IPA 的实体存储。只有标记“可写”的盘才会接收复制、改名或隔离操作。表格中的管理顺序同时作为来源优先级；同一完整性等级下，越靠上越优先作为复制来源。</p>
      <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr><th align="left">管理</th><th align="left">挂载/驱动</th><th align="left">副本目录</th><th align="left">可写</th><th align="left">来源优先级</th><th align="left">状态</th></tr></thead><tbody>{storageRows.map(({s,m})=>{const alias=String(s.driver).toLowerCase()==='alias';const idx=(cfg.mounts||[]).findIndex(x=>Number(x.storageId)===Number(s.id));return <tr key={s.id} style={{borderTop:'1px solid #e5e7eb'}}><td style={{padding:8}}><input type="checkbox" disabled={alias} checked={!!m} onChange={e=>toggleStorage(s,e.target.checked)}/>{alias&&<small> 分流盘</small>}</td><td style={{padding:8}}><b>{s.mountPath}</b><br/><small>{s.driver}{s.remark?` · ${s.remark}`:''}</small></td><td style={{padding:8}}>{m?<input style={{minWidth:260}} value={m.rootPath||s.mountPath} onChange={e=>updateMount(s,{rootPath:e.target.value})}/>:<span>—</span>}</td><td style={{padding:8}}>{m?<input type="checkbox" checked={!!m.writable} onChange={e=>updateMount(s,{writable:e.target.checked})}/>:<span>—</span>}</td><td style={{padding:8}}>{m?<div className="actions"><span>#{idx+1}</span><button disabled={idx<=0} onClick={()=>movePriority(s.id,-1)}>↑</button><button disabled={idx<0||idx>=(cfg.mounts||[]).length-1} onClick={()=>movePriority(s.id,1)}>↓</button></div>:<span>—</span>}</td><td style={{padding:8}}>{s.disabled?'已禁用':s.status||'unknown'}</td></tr>})}</tbody></table></div>
      <p><small>安全规则：MD5 已验证的来源始终优先于“无 Hash、未验证”的来源；只有完整性等级相同，才按上面的来源优先级排序。MD5/大小异常的副本永远不会作为自动补齐来源。</small></p>
      <div className="actions"><button className="primary" disabled={busy} onClick={save}>保存副本配置</button><button disabled={busy||!cfg.enabled} onClick={()=>runPreview({forceRefresh:false})}>对账（优先快照）</button><button disabled={busy||!cfg.enabled} onClick={()=>runPreview({forceRefresh:true})}>强制刷新全部</button><button disabled={busy||!preview||!cfg.allowCopy} onClick={()=>planSync([])}>预览补齐计划（20 个）</button><button disabled={busy} onClick={load}>刷新挂载列表</button></div>
    </div>

    {syncPlan&&<div className="admin-panel"><h3>补齐计划预览</h3><p>这里只预览，不会复制。执行前明确显示每个 IPA 的“来源盘 → 目标盘”。计划 Hash 同时绑定来源/目标目录和期望 MD5/大小；如果副本状态、期望内容或优先级变化，后端会拒绝旧计划并要求重新预览。</p><div className="stat-grid"><Card t="计划复制" v={syncPlan.summary?.actions||0}/><Card t="MD5 已验证来源" v={syncPlan.summary?.verifiedSourceActions||0}/><Card t="未验证来源" v={syncPlan.summary?.unverifiedSourceActions||0}/><Card t="完整性异常阻止" v={syncPlan.summary?.blockedIntegrity||0}/></div><div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr><th align="left">IPA</th><th align="left">来源盘 → 目标盘</th><th align="left">来源可信度</th><th align="left">期望校验</th></tr></thead><tbody>{(syncPlan.actions||[]).map((x,i)=><tr key={`${x.relativePath}-${x.targetStorageId}-${i}`} style={{borderTop:'1px solid #e5e7eb'}}><td style={{padding:8,wordBreak:'break-all'}}>{x.relativePath}</td><td style={{padding:8}}><b>{x.sourceLabel}</b> → <b>{x.targetLabel}</b></td><td style={{padding:8}}>{sourceConfidence(x.sourceStatus)}</td><td style={{padding:8}}><small>{x.expectedMd5?`MD5 ${x.expectedMd5}`:x.expectedSize?`大小 ${fmtBytes(x.expectedSize)}`:'仅确认存在'}</small></td></tr>)}</tbody></table></div>{!syncPlan.actions?.length&&<p>当前没有可安全提交的缺失副本任务。</p>}<div className="actions"><button className="primary" disabled={busy||!syncPlan.actions?.length} onClick={executePlan}>确认执行当前计划</button><button disabled={busy} onClick={()=>setSyncPlan(null)}>取消计划</button></div></div>}

    <div className="admin-panel"><h3>分流设置</h3><p>先在 OpenList 创建一个 <b>Alias</b>，把所有副本目录作为“路径”，然后在这里选择这个 Alias。读取冲突策略请选择 <b>按文件负载均衡</b>；公开下载地址必须经过 Alias，才会真正分流。</p>
      <div className="form-grid"><label>选择 Alias 分流盘<select value={cfg.aliasMountPath||''} onChange={e=>setCfg({...cfg,aliasMountPath:e.target.value})}><option value="">请选择</option>{aliases.map(a=><option key={a.id} value={a.mountPath}>{a.mountPath} · {a.status||'unknown'}</option>)}</select></label><label>分流公开下载根地址<input readOnly value={aliasPublicRoot||'选择 Alias 后自动生成'}/></label></div>
      <div className="row"><b>Alias 要填写的副本路径</b><span>{aliasPaths.length} 个</span></div><textarea readOnly rows={Math.min(10,Math.max(3,aliasPaths.length))} style={{width:'100%',fontFamily:'monospace'}} value={aliasPathsText||'请先在上方勾选实体网盘并填写副本目录'}/><div className="actions"><button disabled={!aliasPathsText} onClick={()=>copyText(aliasPathsText,'Alias 路径')}>复制 Alias 路径</button><button disabled={!aliasPublicRoot} onClick={()=>copyText(aliasPublicRoot,'分流下载根地址')}>复制分流根地址</button></div>
      <p><b>使用顺序：</b>① OpenList → 存储 → 新增/编辑 Alias；② 路径粘贴上面的每个副本目录；③ 读取冲突策略选“按文件负载均衡”；④ 保存 Alias；⑤ 回到这里选择 Alias 并保存副本配置；⑥ 对账确认所有网盘副本一致后，公开下载地址必须使用上面的 Alias 分流根地址。</p>
      {pAlias?<><div className="row"><b>{pAlias.mountPath}</b><span>覆盖 {pAlias.matchedCount}/{pAlias.requiredCount} 个已选副本目录 · {pAlias.status||'unknown'}</span></div><p>{pAlias.matchedCount===pAlias.requiredCount&&pAlias.requiredCount>0?'Alias 已覆盖全部已选副本目录，可以作为分流入口。':'Alias 尚未覆盖全部已选副本目录，请把缺少的目录补进 OpenList Alias。'}</p>{Object.keys(pAlias.policyHints||{}).length>0&&<small>OpenList 返回的策略线索：{JSON.stringify(pAlias.policyHints)}</small>}</>:<p>{aliases.length?'已发现 Alias，请在上方选择一个作为分流入口。':'当前没有发现 Alias。请先在 OpenList 新建 Alias，再点“刷新挂载列表”。'}</p>}
    </div>

    {preview&&<><div className="row"><b>最近对账</b><span>{preview.generatedAt?new Date(preview.generatedAt).toLocaleString():'—'} · 结果已持久化，切换页面不会消失</span></div><div className="stat-grid"><Card t="数据库期望 IPA" v={preview.expectedCount}/><Card t="管理网盘" v={preview.mounts?.length}/><Card t="OpenList API 请求" v={stats.openListRequests||0}/><Card t="快照命中 / 实扫" v={`${stats.snapshotHits||0} / ${stats.remoteMountScans||0}`}/></div><div className="actions"><button onClick={()=>setAllExpanded(true)}>全部展开</button><button onClick={()=>setAllExpanded(false)}>全部收起</button><button disabled={busy} onClick={()=>runPreview({forceRefresh:false})}>重新对账（优先快照）</button><button disabled={busy} onClick={()=>runPreview({forceRefresh:true})}>强制刷新全部</button></div>
      {preview.mounts?.map(m=>{const id=Number(m.storageId),open=!!expanded[id],extra=pageOf(m.extra,extraPages[id]),missing=pageOf(m.missing,missingPages[id]),issues=pageOf(m.integrityIssues,issuePages[id]);return <div className="admin-panel" key={m.storageId}><div className="row" style={{cursor:'pointer'}} onClick={()=>setExpanded(x=>({...x,[id]:!open}))}><b>{open?'▼':'▶'} {m.label||m.mountPath}</b><span>{m.rootPath} · 现有 {m.total} · 已验证 {m.verified||0} · 未验证 {m.unverified||0} · 异常 {m.integrityIssues?.length||0} · 缺失 {m.missing?.length||0} · 多余 {m.extra?.length||0}</span></div>{open&&<div>{m.error?<div className="toast">扫描失败：{m.error}</div>:<>
        <div className="row"><span>目录快照：{m.snapshot?.cacheHit?'命中缓存':'本次实扫'} · {m.snapshot?.scannedAt?new Date(m.snapshot.scannedAt).toLocaleString():'—'} · {ageText(m.snapshot?.ageMs)}</span><div className="actions"><button disabled={busy} onClick={()=>runPreview({forceRefresh:true,storageIds:[id]})}>只刷新这个盘</button>{m.writable&&missing.total>0&&<button disabled={busy||!cfg.allowCopy} onClick={()=>planSync([id])}>预览补齐此盘（20 个）</button>}</div></div>
        {issues.total>0&&<details open><summary>副本完整性异常（{issues.total}）</summary><p>异常副本不会自动作为复制来源，也不会被自动覆盖；先确认后再做隔离/重新补齐策略。</p>{issues.rows.map(x=><div className="row" key={`${x.relativePath}-${x.status}`}><span style={{wordBreak:'break-all'}}>{x.relativePath}<br/><small>{integrityText(x.status)} · 期望 MD5 {x.expectedMd5||'—'} · 实际 MD5 {x.actualMd5||'—'} · 期望 {fmtBytes(x.expectedSize)} · 实际 {fmtBytes(x.actualSize)}</small></span></div>)}<Pager value={issues} onChange={p=>setIssuePages(x=>({...x,[id]:p}))}/></details>}
        {m.renameSuggestions?.length>0&&<details><summary>可按 MD5 修复名称（{m.renameSuggestions.length}）</summary>{m.renameSuggestions.map(x=><div className="row" key={`${x.fromRelative}->${x.toRelative}`}><span style={{wordBreak:'break-all'}}>{x.fromRelative} → <b>{x.toRelative}</b></span><button disabled={busy||!cfg.allowRename||!m.writable} onClick={()=>rename(m.storageId,x)}>按建议改名</button></div>)}</details>}
        <h4>多余 IPA（{extra.total}）</h4>{extra.total===0?<p>没有多余 IPA。</p>:<><p>已经自动列出全部多余 IPA，每页 {PAGE_SIZE} 条。</p>{extra.rows.map(x=><div className="row" key={x.relativePath}><span style={{wordBreak:'break-all'}}>{x.relativePath}<br/><small>{fmtBytes(x.size)}{x.md5?` · MD5 ${x.md5}`:''}</small></span><button disabled={busy||!cfg.allowQuarantine||!m.writable} onClick={()=>quarantine(m.storageId,x.relativePath)}>移到隔离区</button></div>)}<Pager value={extra} onChange={p=>setExtraPages(x=>({...x,[id]:p}))}/></>}
        <h4>缺失 IPA（{missing.total}）</h4>{missing.total===0?<p>没有缺失 IPA。</p>:<>{missing.rows.map(x=><div className="row" key={x.relativePath}><span style={{wordBreak:'break-all'}}>{x.relativePath}</span><small>{x.apps?.map(a=>a.name).filter(Boolean).join(' / ')||'—'}</small></div>)}<Pager value={missing} onChange={p=>setMissingPages(x=>({...x,[id]:p}))}/></>}
      </>}</div>}</div>})}</>}
  </div>;
}
