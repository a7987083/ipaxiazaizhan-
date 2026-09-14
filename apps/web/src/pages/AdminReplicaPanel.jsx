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
  return <div className="actions"><button disabled={value.page<=1} onClick={()=>onChange(value.page-1)}>上一页</button><span>第 {value.page}/{value.pages} 页 · 共 {value.total} 条 · 每页 {PAGE_SIZE} 条</span><button disabled={value.page>=value.pages} onClick={()=>onChange(value.page+1)}>下一页</button></div>
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

export default function AdminReplicaPanel(){
  const[state,setState]=useState(null),[cfg,setCfg]=useState(emptyCfg),[preview,setPreview]=useState(null),[note,setNote]=useState(''),[busy,setBusy]=useState(false);
  const[expanded,setExpanded]=useState({}),[extraPages,setExtraPages]=useState({}),[missingPages,setMissingPages]=useState({});
  const applyPreview=(p)=>{
    setPreview(p||null);setExtraPages({});setMissingPages({});
    if(p?.mounts?.length){setExpanded(x=>Object.keys(x).length?x:Object.fromEntries(p.mounts.map((m,i)=>[Number(m.storageId),p.mounts.length===1||i===0])))}
  };
  const load=async()=>{try{const r=await api.admin('/openlist/replicas');setState(r.data);setCfg({...emptyCfg,...(r.data?.config||{}),mounts:r.data?.config?.mounts||[]});if(r.data?.lastPreview)applyPreview(r.data.lastPreview)}catch(e){setNote(e.message)}};
  useEffect(()=>{load()},[]);
  const mounts=useMemo(()=>new Map((cfg.mounts||[]).map(x=>[Number(x.storageId),x])),[cfg.mounts]);
  const storageRows=(state?.storages||[]).map(s=>({s,m:mounts.get(Number(s.id))}));
  const updateMount=(s,patch)=>{const current=mounts.get(Number(s.id))||{storageId:s.id,mountPath:s.mountPath,rootPath:s.mountPath,label:s.remark||s.mountPath,enabled:true,writable:false};const next={...current,...patch,storageId:s.id,mountPath:s.mountPath};setCfg(x=>({...x,mounts:[...(x.mounts||[]).filter(m=>Number(m.storageId)!==Number(s.id)),next]}))};
  const toggleStorage=(s,on)=>{if(on)updateMount(s,{enabled:true});else setCfg(x=>({...x,mounts:(x.mounts||[]).filter(m=>Number(m.storageId)!==Number(s.id))}))};
  const save=async()=>{setBusy(true);setNote('');try{await api.admin('/openlist/replicas',{method:'PUT',body:JSON.stringify(cfg)});setPreview(null);setNote('云盘副本配置已保存；旧对账和网盘快照已失效，请重新对账。');await load()}catch(e){setNote(e.message)}finally{setBusy(false)}};
  const runPreview=async({forceRefresh=false,storageIds=[]}={})=>{setBusy(true);setNote(forceRefresh?'正在刷新指定网盘目录…':'正在对账；30 分钟内优先使用 ZONOE 网盘快照…');try{const r=await api.admin('/openlist/replicas/preview',{method:'POST',body:JSON.stringify({forceRefresh,storageIds})});applyPreview(r.data);const s=r.data?.apiStats||{};setNote(`对账完成 · OpenList 请求 ${s.openListRequests||0} · 快照命中 ${s.snapshotHits||0} 个盘 · 实际重扫 ${s.remoteMountScans||0} 个盘。`)}catch(e){setNote(e.message)}finally{setBusy(false)}};
  const sync=async(targetStorageIds=[])=>{const target=targetStorageIds.length?'指定网盘':'所有可写网盘';if(!confirm(`把当前缺失副本补到${target}？本次最多提交 20 个复制任务。`))return;setBusy(true);try{const r=await api.admin('/openlist/replicas/sync',{method:'POST',body:JSON.stringify({limit:20,targetStorageIds})});const invalid=(r.data.targetSnapshotsInvalidated||[]).length;setNote(`已提交 ${r.data.queued?.length||0} 个复制任务，失败 ${r.data.failed?.length||0} 个；${invalid} 个目标盘快照已失效。OpenList 可能仍在后台复制，稍后只刷新目标盘确认即可。`)}catch(e){setNote(e.message)}finally{setBusy(false)}};
  const rename=async(storageId,x)=>{if(!confirm(`确认把 ${x.fromRelative} 改名为 ${x.toRelative}？此建议来自相同 MD5。`))return;setBusy(true);try{const r=await api.admin('/openlist/replicas/rename',{method:'POST',body:JSON.stringify({storageId,fromRelative:x.fromRelative,toRelative:x.toRelative})});if(r.data?.preview)applyPreview(r.data.preview);setNote('名称修复完成；仅刷新了受影响网盘，没有全盘重扫。')}catch(e){setNote(e.message)}finally{setBusy(false)}};
  const quarantine=async(storageId,relativePath)=>{if(!confirm(`把多余 IPA 移到隔离区？\n${relativePath}\n\n不会永久删除。`))return;setBusy(true);try{const r=await api.admin('/openlist/replicas/quarantine',{method:'POST',body:JSON.stringify({items:[{storageId,relativePath}]})});if(r.data?.preview)applyPreview(r.data.preview);setNote('已移动到隔离区；仅刷新了受影响网盘，没有全盘重扫。')}catch(e){setNote(e.message)}finally{setBusy(false)}};
  const copyText=async(text,label='内容')=>{try{await navigator.clipboard.writeText(text);setNote(`${label}已复制`)}catch{setNote('浏览器未允许复制，请手动选择复制')}};
  const aliases=state?.alias?.candidates||[],pAlias=preview?.alias?.preferred||state?.alias?.preferred;
  const aliasPaths=(cfg.mounts||[]).filter(x=>x.enabled!==false).map(x=>x.rootPath).filter(Boolean);
  const aliasPathsText=aliasPaths.join('\n');
  const aliasPublicRoot=cleanPublicRoot(state?.openListUrl,cfg.aliasMountPath);
  const setAllExpanded=(on)=>setExpanded(Object.fromEntries((preview?.mounts||[]).map(m=>[Number(m.storageId),on])));
  const stats=preview?.apiStats||{};

  return <div className="admin-panel"><h2>云盘副本管理</h2><p>数据库下载地址是期望清单；实体网盘保存副本；OpenList Alias 负责最终下载分流。ZONOE 只调用 OpenList 文件操作 API，不中转 IPA 数据。网盘目录快照默认保留 30 分钟，对账优先读快照，避免频繁请求 OpenList。</p>{note&&<div className="toast">{note}</div>}
    {state?.storageError&&<div className="toast">无法读取 OpenList 挂载列表：{state.storageError}。请使用具备存储管理权限的 OpenList 程序令牌。</div>}
    <div className="form-grid"><label>启用副本管理<input type="checkbox" checked={!!cfg.enabled} onChange={e=>setCfg({...cfg,enabled:e.target.checked})}/></label><label>允许副本复制<input type="checkbox" checked={!!cfg.allowCopy} onChange={e=>setCfg({...cfg,allowCopy:e.target.checked})}/></label><label>允许名称修复<input type="checkbox" checked={!!cfg.allowRename} onChange={e=>setCfg({...cfg,allowRename:e.target.checked})}/></label><label>允许移动到隔离区<input type="checkbox" checked={!!cfg.allowQuarantine} onChange={e=>setCfg({...cfg,allowQuarantine:e.target.checked})}/></label><label>隔离目录名<input value={cfg.quarantineFolder||''} onChange={e=>setCfg({...cfg,quarantineFolder:e.target.value})}/></label></div>

    <div className="admin-panel"><h3>OpenList 挂载网盘</h3><p>勾选真正保存 IPA 的实体存储。副本目录可以是挂载根目录下的子目录，例如 <code>/天翼01/app</code>。只有标记“可写”的盘才会接收复制、改名或隔离操作。</p><div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr><th align="left">管理</th><th align="left">挂载/驱动</th><th align="left">副本目录</th><th align="left">可写</th><th align="left">状态</th></tr></thead><tbody>{storageRows.map(({s,m})=>{const alias=String(s.driver).toLowerCase()==='alias';return <tr key={s.id} style={{borderTop:'1px solid #e5e7eb'}}><td style={{padding:8}}><input type="checkbox" disabled={alias} checked={!!m} onChange={e=>toggleStorage(s,e.target.checked)}/>{alias&&<small> 分流盘</small>}</td><td style={{padding:8}}><b>{s.mountPath}</b><br/><small>{s.driver}{s.remark?` · ${s.remark}`:''}</small></td><td style={{padding:8}}>{m?<input style={{minWidth:260}} value={m.rootPath||s.mountPath} onChange={e=>updateMount(s,{rootPath:e.target.value})}/>:<span>—</span>}</td><td style={{padding:8}}>{m?<input type="checkbox" checked={!!m.writable} onChange={e=>updateMount(s,{writable:e.target.checked})}/>:<span>—</span>}</td><td style={{padding:8}}>{s.disabled?'已禁用':s.status||'unknown'}</td></tr>})}</tbody></table></div><div className="actions"><button className="primary" disabled={busy} onClick={save}>保存副本配置</button><button disabled={busy||!cfg.enabled} onClick={()=>runPreview({forceRefresh:false})}>对账（优先快照）</button><button disabled={busy||!cfg.enabled} onClick={()=>runPreview({forceRefresh:true})}>强制刷新全部</button><button disabled={busy||!preview||!cfg.allowCopy} onClick={()=>sync([])}>一键补齐所有网盘（20 个）</button><button disabled={busy} onClick={load}>刷新挂载列表</button></div></div>

    <div className="admin-panel"><h3>分流设置</h3><p>先在 OpenList 创建一个 <b>Alias</b>，把所有副本目录作为“路径”，然后在这里选择这个 Alias。读取冲突策略请选择 <b>按文件负载均衡</b>；公开下载地址必须经过 Alias，才会真正分流。</p>
      <div className="form-grid"><label>选择 Alias 分流盘<select value={cfg.aliasMountPath||''} onChange={e=>setCfg({...cfg,aliasMountPath:e.target.value})}><option value="">请选择</option>{aliases.map(a=><option key={a.id} value={a.mountPath}>{a.mountPath} · {a.status||'unknown'}</option>)}</select></label><label>分流公开下载根地址<input readOnly value={aliasPublicRoot||'选择 Alias 后自动生成'}/></label></div>
      <div className="row"><b>Alias 要填写的副本路径</b><span>{aliasPaths.length} 个</span></div><textarea readOnly rows={Math.min(10,Math.max(3,aliasPaths.length))} style={{width:'100%',fontFamily:'monospace'}} value={aliasPathsText||'请先在上方勾选实体网盘并填写副本目录'}/><div className="actions"><button disabled={!aliasPathsText} onClick={()=>copyText(aliasPathsText,'Alias 路径')}>复制 Alias 路径</button><button disabled={!aliasPublicRoot} onClick={()=>copyText(aliasPublicRoot,'分流下载根地址')}>复制分流根地址</button></div>
      <p><b>使用顺序：</b>① OpenList → 存储 → 新增/编辑 Alias；② 路径粘贴上面的每个副本目录；③ 读取冲突策略选“按文件负载均衡”；④ 保存 Alias；⑤ 回到这里选择 Alias 并保存副本配置；⑥ 对账确认所有网盘副本一致后，公开下载地址必须使用上面的 Alias 分流根地址。</p>
      {pAlias?<><div className="row"><b>{pAlias.mountPath}</b><span>覆盖 {pAlias.matchedCount}/{pAlias.requiredCount} 个已选副本目录 · {pAlias.status||'unknown'}</span></div><p>{pAlias.matchedCount===pAlias.requiredCount&&pAlias.requiredCount>0?'Alias 已覆盖全部已选副本目录，可以作为分流入口。':'Alias 尚未覆盖全部已选副本目录，请把缺少的目录补进 OpenList Alias。'}</p>{Object.keys(pAlias.policyHints||{}).length>0&&<small>OpenList 返回的策略线索：{JSON.stringify(pAlias.policyHints)}</small>}</>:<p>{aliases.length?'已发现 Alias，请在上方选择一个作为分流入口。':'当前没有发现 Alias。请先在 OpenList 新建 Alias，再点“刷新挂载列表”。'}</p>}
    </div>

    {preview&&<><div className="row"><b>最近对账</b><span>{preview.generatedAt?new Date(preview.generatedAt).toLocaleString():'—'} · 结果已持久化，切换页面不会消失</span></div><div className="stat-grid"><Card t="数据库期望 IPA" v={preview.expectedCount}/><Card t="管理网盘" v={preview.mounts?.length}/><Card t="OpenList API 请求" v={stats.openListRequests||0}/><Card t="快照命中 / 实扫" v={`${stats.snapshotHits||0} / ${stats.remoteMountScans||0}`}/></div><div className="actions"><button onClick={()=>setAllExpanded(true)}>全部展开</button><button onClick={()=>setAllExpanded(false)}>全部收起</button><button disabled={busy} onClick={()=>runPreview({forceRefresh:false})}>重新对账（优先快照）</button><button disabled={busy} onClick={()=>runPreview({forceRefresh:true})}>强制刷新全部</button></div>
      {preview.mounts?.map(m=>{const id=Number(m.storageId),open=!!expanded[id],extra=pageOf(m.extra,extraPages[id]),missing=pageOf(m.missing,missingPages[id]);return <div className="admin-panel" key={m.storageId}><div className="row" style={{cursor:'pointer'}} onClick={()=>setExpanded(x=>({...x,[id]:!open}))}><b>{open?'▼':'▶'} {m.label||m.mountPath}</b><span>{m.rootPath} · 现有 {m.total} · 正常 {m.present} · 缺失 {m.missing?.length||0} · 多余 {m.extra?.length||0}</span></div>{open&&<div>{m.error?<div className="toast">扫描失败：{m.error}</div>:<>
        <div className="row"><span>目录快照：{m.snapshot?.cacheHit?'命中缓存':'本次实扫'} · {m.snapshot?.scannedAt?new Date(m.snapshot.scannedAt).toLocaleString():'—'} · {ageText(m.snapshot?.ageMs)}</span><div className="actions"><button disabled={busy} onClick={()=>runPreview({forceRefresh:true,storageIds:[id]})}>只刷新这个盘</button>{m.writable&&missing.total>0&&<button disabled={busy||!cfg.allowCopy} onClick={()=>sync([id])}>补齐此盘缺失（20 个）</button>}</div></div>
        {m.renameSuggestions?.length>0&&<details><summary>可按 MD5 修复名称（{m.renameSuggestions.length}）</summary>{m.renameSuggestions.map(x=><div className="row" key={`${x.fromRelative}->${x.toRelative}`}><span style={{wordBreak:'break-all'}}>{x.fromRelative} → <b>{x.toRelative}</b></span><button disabled={busy||!cfg.allowRename||!m.writable} onClick={()=>rename(m.storageId,x)}>按建议改名</button></div>)}</details>}
        <h4>多余 IPA（{extra.total}）</h4>{extra.total===0?<p>没有多余 IPA。</p>:<><p>已经自动列出全部多余 IPA，每页 {PAGE_SIZE} 条。</p>{extra.rows.map(x=><div className="row" key={x.relativePath}><span style={{wordBreak:'break-all'}}>{x.relativePath}<br/><small>{fmtBytes(x.size)}{x.md5?` · MD5 ${x.md5}`:''}</small></span><button disabled={busy||!cfg.allowQuarantine||!m.writable} onClick={()=>quarantine(m.storageId,x.relativePath)}>移到隔离区</button></div>)}<Pager value={extra} onChange={p=>setExtraPages(x=>({...x,[id]:p}))}/></>}
        <h4>缺失 IPA（{missing.total}）</h4>{missing.total===0?<p>没有缺失 IPA。</p>:<>{missing.rows.map(x=><div className="row" key={x.relativePath}><span style={{wordBreak:'break-all'}}>{x.relativePath}</span><small>{x.apps?.map(a=>a.name).filter(Boolean).join(' / ')||'—'}</small></div>)}<Pager value={missing} onChange={p=>setMissingPages(x=>({...x,[id]:p}))}/></>}
      </>}</div>}</div>})}</>}
  </div>
}
