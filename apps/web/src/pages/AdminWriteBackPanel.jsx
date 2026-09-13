import {useEffect,useState} from 'react';
import {api} from '../lib/api';

const strategyLabels={preview:'只预览，不写入',changed:'值变化时更新',empty:'仅数据库为空时填充',always:'始终以该值为准'};
export default function AdminWriteBackPanel({sources=[]}){
  const[sourceId,setSourceId]=useState(''),[info,setInfo]=useState(null),[preview,setPreview]=useState(null),[history,setHistory]=useState([]),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false),[previewFilter,setPreviewFilter]=useState('all');
  useEffect(()=>{if(!sourceId&&sources.length)setSourceId(String(sources[0].id))},[sources,sourceId]);
  const load=async id=>{if(!id)return;setMsg('');try{const[r,h]=await Promise.all([api.admin(`/sources/${id}/writeback`),api.admin(`/sources/${id}/writeback/history?limit=30`)]);setInfo(r.data);setHistory(h.data?.items||[]);setPreview(null);setPreviewFilter('all')}catch(e){setMsg(e.message)}};
  useEffect(()=>{if(sourceId)load(sourceId)},[sourceId]);
  const setTop=(key,value)=>setInfo(x=>({...x,config:{...x.config,[key]:value}}));
  const patchRule=(id,patch)=>setInfo(x=>({...x,config:{...x.config,rules:(x.config.rules||[]).map(rule=>rule.id===id?{...rule,...patch}:rule)}}));
  const addRule=()=>setInfo(x=>({...x,config:{...x.config,rules:[...(x.config.rules||[]),{id:`custom-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,enabled:false,source:'',column:'',strategy:'preview'}]}}));
  const removeRule=id=>setInfo(x=>({...x,config:{...x.config,rules:(x.config.rules||[]).filter(rule=>rule.id!==id)}}));
  const save=async()=>{if(!sourceId||!info)return;setBusy(true);setMsg('');try{const r=await api.admin(`/sources/${sourceId}/writeback`,{method:'PUT',body:JSON.stringify(info.config)});setInfo(r.data);setMsg('数据同步规则已保存')}catch(e){setMsg(e.message)}finally{setBusy(false)}};
  const runPreview=async()=>{if(!sourceId)return;setBusy(true);setMsg('');try{const r=await api.admin(`/sources/${sourceId}/writeback/preview?limit=50`);setPreview(r.data);setPreviewFilter('all');setMsg(`预览完成：扫描 ${r.data.scanned||0} 个已解析 App，${r.data.changeApps||0} 个存在可写变化`)}catch(e){setMsg(e.message)}finally{setBusy(false)}};
  const applyPreview=async()=>{const keys=(preview?.items||[]).filter(x=>x.writeCount>0).map(x=>x.appKey);if(!keys.length)return setMsg('当前预览没有需要写入的变化');if(!confirm(`确定把预览中的 ${keys.length} 个已有 App 按当前规则写入数据库？不会新增 App。`))return;setBusy(true);setMsg('');try{const r=await api.admin(`/sources/${sourceId}/writeback/apply`,{method:'POST',body:JSON.stringify({limit:200,appKeys:keys})});setMsg(`同步完成：更新 ${r.data.apps||0} 个 App / ${r.data.applied||0} 个字段，失败 ${r.data.failed||0}`);await load(sourceId);await runPreview()}catch(e){setMsg(e.message)}finally{setBusy(false)}};
  if(!sources.length)return <div className="admin-panel"><h2>数据同步</h2><p>请先添加 MySQL 软件源。</p></div>;

  const cfg=info?.config||{},columns=info?.columns||[],dataSources=info?.sources||info?.fields||[],rules=cfg.rules||[];
  const previewItems=(preview?.items||[]).filter(item=>previewFilter==='all'||(previewFilter==='diff'&&Number(item.previewCount||0)>0)||(previewFilter==='write'&&Number(item.writeCount||0)>0));
  const sourceByKey=Object.fromEntries(dataSources.map(x=>[x.key,x]));
  const onSourceChange=(rule,value)=>{
    const def=sourceByKey[value];
    const patch={source:value};
    if(def?.defaultStrategy)patch.strategy=def.defaultStrategy;
    if(!rule.column&&def?.suggest?.length){
      const names=new Set(columns.map(c=>c.name));
      patch.column=def.suggest.find(x=>names.has(x))||'';
    }
    patchRule(rule.id,patch);
  };
  const onColumnChange=(rule,value)=>{
    const patch={column:value};
    const matched=dataSources.find(s=>(s.suggest||[]).includes(value));
    if(matched)patch.source=matched.key;
    if(matched?.defaultStrategy&&(!rule.source||rule.source!==matched.key))patch.strategy=matched.defaultStrategy;
    patchRule(rule.id,patch);
  };

  return <div className="admin-panel"><h2>IPA 解析结果 → MySQL 数据同步</h2><p>默认只预览，不修改数据库。每一条规则都可以改“写入内容”、改目标数据库字段、改策略、删除；也可以新增规则。当前版本仍只更新已有 App，不自动 INSERT 新记录。</p>{msg&&<div className="toast">{msg}</div>}<div className="row"><b>选择软件源</b><select value={sourceId} onChange={e=>setSourceId(e.target.value)}>{sources.map(s=><option key={s.id} value={s.id}>{s.name} · {s.database}/{s.table}</option>)}</select></div>{info&&<><div className="admin-panel"><h3>写入方式</h3><div className="form-grid"><label>允许手动写入数据库<input type="checkbox" checked={!!cfg.enabled} onChange={e=>setTop('enabled',e.target.checked)}/><small>关闭时只能预览，点击“确认同步”也不会写库。</small></label><label>IPA 解析成功后自动写入数据库<input type="checkbox" disabled={!cfg.enabled} checked={!!cfg.autoApply} onChange={e=>setTop('autoApply',e.target.checked)}/><small>开启后，解析成功且 MD5 当前有效时，后台按下面规则自动更新已有 App。</small></label></div></div>

  <div className="admin-panel"><h3>同步规则</h3><p>“写入内容”来自 IPA 解析或该 App 的 IPA 下载链接；“数据库字段”来自当前软件源真实表结构。选择常见数据库字段时会自动给出匹配的数据来源，例如选择 <code>bt1a</code> 会自动切到“IPA 下载链接”，之后仍可手动改成别的来源。</p><div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr><th align="left">启用</th><th align="left">写入内容</th><th align="left">数据库字段</th><th align="left">写入策略</th><th align="left">操作</th></tr></thead><tbody>{rules.map((rule,index)=><tr key={rule.id} style={{borderTop:'1px solid #e5e7eb'}}><td style={{padding:'10px 6px'}}><input type="checkbox" checked={!!rule.enabled} onChange={e=>patchRule(rule.id,{enabled:e.target.checked})}/></td><td style={{padding:'10px 6px'}}><select value={rule.source||''} onChange={e=>onSourceChange(rule,e.target.value)}><option value="">选择数据来源</option>{dataSources.map(s=><option key={s.key} value={s.key}>{s.label}</option>)}</select>{rule.source&&<><br/><small>{rule.source}</small></>}</td><td style={{padding:'10px 6px'}}><select value={rule.column||''} onChange={e=>onColumnChange(rule,e.target.value)}><option value="">不映射</option>{columns.map(c=><option key={c.name} value={c.name}>{c.name} · {c.type}</option>)}</select></td><td style={{padding:'10px 6px'}}><select value={rule.strategy||'preview'} onChange={e=>patchRule(rule.id,{strategy:e.target.value})}>{Object.entries(strategyLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></td><td style={{padding:'10px 6px'}}><button onClick={()=>removeRule(rule.id)}>删除</button></td></tr>)}</tbody></table></div>{rules.length===0&&<p>还没有同步规则。点击下面按钮新增。</p>}<div className="actions"><button onClick={addRule}>＋ 新增映射规则</button><button className="primary" disabled={busy} onClick={save}>保存同步规则</button><button disabled={busy} onClick={runPreview}>预览前 50 个已解析 App</button></div></div>

  {preview&&<div className="admin-panel"><h3>写入预览</h3><p>扫描 {preview.scanned||0} 个 · 有可写变化 {preview.changeApps||0} 个 · 可写字段 {preview.writeFields||0} 个。策略为“只预览”的规则会显示差异，但不会写入。</p><div className="inline-form"><select value={previewFilter} onChange={e=>setPreviewFilter(e.target.value)}><option value="all">全部已扫描 App</option><option value="diff">仅有字段差异</option><option value="write">仅可写变化</option></select><span>当前显示 {previewItems.length}/{preview.items?.length||0} 个 App</span></div><div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr><th align="left">App</th><th align="left">字段变化</th></tr></thead><tbody>{previewItems.map(item=><tr key={item.appKey} style={{borderTop:'1px solid #e5e7eb',verticalAlign:'top'}}><td style={{padding:'10px 6px',minWidth:180}}><b>{item.appName||item.appKey}</b><br/><small>ID {item.legacyId} · {item.appKey}</small></td><td style={{padding:'10px 6px'}}>{item.changes?.length?item.changes.map((c,i)=><div key={`${c.ruleId||c.field}-${i}`}><b>{c.label}</b> → <code>{c.column}</code>：{c.before||'（空）'} → {c.next} · {strategyLabels[c.strategy]} {c.willWrite?<strong>【会写入】</strong>:<span>【不写入】</span>}</div>):<span>无差异：当前启用规则对应的数据与数据库一致，无需写入。</span>}</td></tr>)}</tbody></table></div>{previewItems.length===0&&<p>当前筛选没有结果。</p>}<div className="actions"><button className="primary" disabled={busy||!cfg.enabled||!preview.writeFields} onClick={applyPreview}>确认把预览中的变化写入数据库</button></div></div>}
  <div className="admin-panel"><h3>最近写入历史</h3>{history.length===0?<p>暂无写入记录。</p>:history.map((x,i)=><div className="row" key={`${x.at}-${x.appKey}-${i}`}><b>{x.status==='success'?'成功':'失败'} · {x.appName||x.appKey}</b><span>{x.at?new Date(x.at).toLocaleString():'—'} · {x.mode==='auto'?'自动':'手动'} · {(x.changes||[]).map(c=>`${c.column}: ${c.before||'空'} → ${c.next}`).join('；')}{x.error?` · ${x.error}`:''}</span></div>)}</div></>}</div>
}
