import {useEffect,useMemo,useState} from 'react';
import {api} from '../lib/api';

const FIELD_DEFS=[
  ['name','App 名称'],['version','版本号'],['build','Build'],['bundle_id','Bundle ID'],
  ['minimum_ios','最低 iOS'],['executable','Executable'],['size','IPA 文件大小'],['md5','IPA MD5']
];
const STRATEGIES=[['if_changed','值变化时更新'],['if_empty','仅数据库为空时填写'],['always','解析值不同时覆盖'],['preview','只预览，永不自动写']];
const emptySync=()=>({mode:'disabled',mappings:Object.fromEntries(FIELD_DEFS.map(([k])=>[k,{enabled:false,column:'',strategy:'if_changed'}]))});
const fmtBytes=n=>{n=Number(n||0);if(!n)return '0 B';if(n>=1024**3)return `${(n/1024**3).toFixed(2)} GB`;if(n>=1024**2)return `${(n/1024**2).toFixed(1)} MB`;if(n>=1024)return `${(n/1024).toFixed(1)} KB`;return `${n} B`};
const clone=x=>JSON.parse(JSON.stringify(x||{}));

export default function AdminAdvancedSettings(){
  const[settings,setSettings]=useState({site_name:'',site_notice:'',hero_title:''});
  const[cache,setCache]=useState(null);
  const[sources,setSources]=useState([]);
  const[sourceId,setSourceId]=useState('');
  const[columns,setColumns]=useState([]);
  const[sync,setSync]=useState(emptySync());
  const[preview,setPreview]=useState(null);
  const[history,setHistory]=useState([]);
  const[note,setNote]=useState('');
  const[busy,setBusy]=useState(false);

  const selected=useMemo(()=>sources.find(x=>String(x.id)===String(sourceId))||null,[sources,sourceId]);
  const loadBase=async()=>{
    try{
      const [s,c,src,h]=await Promise.all([api.admin('/settings'),api.admin('/cache'),api.admin('/sources'),api.admin('/writeback/history?limit=30')]);
      setSettings(x=>({...x,...(s.data||{})})); setCache(c.data); setSources(src.data||[]); setHistory(h.data||[]);
      setSourceId(id=>id || String(src.data?.[0]?.id||''));
    }catch(e){if(/登录|AUTH_/.test(e.message))window.location.assign('/login');else setNote(e.message)}
  };
  useEffect(()=>{loadBase()},[]);
  useEffect(()=>{
    if(!selected){setColumns([]);setSync(emptySync());return;}
    setSync({...emptySync(),...clone(selected.ipaSync),mappings:{...emptySync().mappings,...clone(selected.ipaSync?.mappings||{})}});
    setPreview(null);
    api.admin(`/sources/${selected.id}/columns`).then(r=>setColumns(r.data||[])).catch(e=>setNote(e.message));
  },[selected?.id]);

  const saveSite=async()=>{
    setBusy(true);setNote('');
    try{
      const values={site_name:settings.site_name||'',site_notice:settings.site_notice||'',hero_title:settings.hero_title||''};
      const r=await api.admin('/settings',{method:'PUT',body:JSON.stringify({values})});
      setSettings(x=>({...x,...r.data}));setNote('公开站点设置已保存');
    }catch(e){setNote(e.message)}finally{setBusy(false)}
  };
  const clearCache=async scope=>{
    const labels={directory:'OpenList 目录缓存',ipa:'IPA 解析缓存',failed:'解析失败状态',task:'后台任务状态',all:'全部本地缓存'};
    if(!confirm(`确定清理“${labels[scope]}”？不会删除 OpenList 上的 IPA，也不会删除 MySQL 软件源数据。`))return;
    setBusy(true);setNote('');
    try{const r=await api.admin('/cache/clear',{method:'POST',body:JSON.stringify({scope})});setCache(r.data);setNote(`${labels[scope]}已清理`)}
    catch(e){setNote(e.message)}finally{setBusy(false)}
  };
  const patchMapping=(field,patch)=>setSync(x=>({...x,mappings:{...x.mappings,[field]:{...(x.mappings?.[field]||{}),...patch}}}));
  const saveSync=async()=>{
    if(!selected)return;
    setBusy(true);setNote('');
    try{
      const r=await api.admin(`/sources/${selected.id}/ipa-sync`,{method:'PUT',body:JSON.stringify(sync)});
      setNote('字段映射与写回策略已保存');
      await loadBase();
      const updated=r.data?.source?.ipaSync;if(updated)setSync({...emptySync(),...clone(updated),mappings:{...emptySync().mappings,...clone(updated.mappings||{})}});
    }catch(e){setNote(e.message)}finally{setBusy(false)}
  };
  const runPreview=async()=>{
    if(!selected)return;setBusy(true);setNote('');
    try{const r=await api.admin(`/sources/${selected.id}/ipa-sync/preview`,{method:'POST',body:JSON.stringify({limit:100})});setPreview(r.data);setNote(`预览完成：${r.data?.changed||0} 个 App 有可写变化`)}
    catch(e){setNote(e.message)}finally{setBusy(false)}
  };
  const apply=async()=>{
    if(!selected)return;
    if(!confirm(`确定按当前已保存的字段映射写回“${selected.name}”？只更新已有 App，只写勾选字段，不会 INSERT 新记录。`))return;
    setBusy(true);setNote('');
    try{
      const r=await api.admin(`/sources/${selected.id}/ipa-sync/apply`,{method:'POST',body:JSON.stringify({limit:100})});
      setPreview(r.data);setNote(`写回完成：更新 ${r.data?.updated||0}，跳过 ${r.data?.skipped||0}，失败 ${r.data?.failed||0}`);await loadBase();
    }catch(e){setNote(e.message)}finally{setBusy(false)}
  };

  return <div className="admin-shell">
    <aside><div className="admin-brand">ZONOE<br/><small>设置中心</small></div><a href="/admin">← 返回后台</a><a href="/">返回前台</a></aside>
    <section className="admin-main"><header><h1>设置中心</h1><span>站点设置 · 本地缓存 · IPA 数据库同步</span></header>
      {note&&<div className="toast">{note}<button onClick={()=>setNote('')}>×</button></div>}

      <div className="admin-panel"><h2>公开站点设置</h2><p>这里使用中文名称统一管理公开站点，不再要求填写英文 key。三个设置会一次性保存。</p>
        <div className="form-grid">
          <label>站点名称<input value={settings.site_name||''} onChange={e=>setSettings({...settings,site_name:e.target.value})} placeholder="例如 ZONOE"/></label>
          <label>首页主标题<input value={settings.hero_title||''} onChange={e=>setSettings({...settings,hero_title:e.target.value})} placeholder="首页 Hero 主标题"/></label>
          <label style={{gridColumn:'1 / -1'}}>站点公告<textarea rows="4" value={settings.site_notice||''} onChange={e=>setSettings({...settings,site_notice:e.target.value})} placeholder="公开站点公告"/></label>
        </div><div className="actions"><button className="primary" disabled={busy} onClick={saveSite}>保存站点设置</button></div>
      </div>

      <div className="admin-panel"><h2>本地缓存管理</h2><p>只管理 ZONOE 本机缓存文件；不会删除云盘 IPA，也不会删除或修改 MySQL 软件源记录。</p>
        {cache&&<><div className="stat-grid"><Stat t="缓存总占用" v={fmtBytes(cache.totalBytes)}/><Stat t="IPA 缓存文件" v={cache.ipa?.files||0}/><Stat t="已解析" v={cache.ipa?.parsed||0}/><Stat t="解析失败" v={cache.ipa?.failed||0}/></div>
        <div className="row"><b>IPA 元数据缓存</b><span>{fmtBytes(cache.ipa?.size)} · 待解析 {cache.ipa?.pending||0} · {cache.ipa?.updatedAt?new Date(cache.ipa.updatedAt).toLocaleString():'未生成'}</span></div>
        <div className="row"><b>OpenList 目录缓存</b><span>{fmtBytes(cache.directory?.size)} · {cache.directory?.directories||0} 个目录 · {cache.directory?.updatedAt?new Date(cache.directory.updatedAt).toLocaleString():'未生成'}</span></div>
        <div className="row"><b>后台任务状态</b><span>{cache.task?.state||'idle'} · {cache.task?.stage||'idle'}</span></div></>}
        <div className="actions"><button disabled={busy} onClick={()=>clearCache('directory')}>清理目录缓存</button><button disabled={busy} onClick={()=>clearCache('failed')}>重置失败记录</button><button disabled={busy} onClick={()=>clearCache('task')}>重置任务状态</button><button disabled={busy} onClick={()=>clearCache('ipa')}>清空 IPA 解析缓存</button><button disabled={busy} onClick={()=>clearCache('all')}>清空全部缓存</button><button disabled={busy} onClick={loadBase}>刷新状态</button></div>
      </div>

      <div className="admin-panel"><h2>IPA → MySQL 字段映射</h2><p>默认关闭。只允许更新数据库中已经存在的 App；不会自动新增记录。每个解析字段都可以单独决定是否写回、写到哪个真实列、采用什么策略。</p>
        <div className="form-grid"><label>软件源<select value={sourceId} onChange={e=>setSourceId(e.target.value)}>{sources.map(x=><option key={x.id} value={x.id}>{x.name} · {x.database}/{x.table}</option>)}</select></label>
          <label>同步模式<select value={sync.mode||'disabled'} onChange={e=>setSync({...sync,mode:e.target.value})}><option value="disabled">关闭写回</option><option value="preview">允许手动预览/写回</option><option value="auto_update">自动更新已有 App</option></select></label>
        </div>
        {selected&&<div className="row"><b>{selected.name}</b><span>{selected.host}:{selected.port}/{selected.database} · 表 {selected.table} · 已读取 {columns.length} 个真实字段</span></div>}
        <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',marginTop:12}}><thead><tr><th align="left">IPA 字段</th><th align="left">写回</th><th align="left">数据库字段</th><th align="left">策略</th></tr></thead><tbody>
          {FIELD_DEFS.map(([field,label])=>{const m=sync.mappings?.[field]||{};return <tr key={field} style={{borderTop:'1px solid #e5e7eb'}}><td style={{padding:'10px 6px'}}><b>{label}</b><br/><small>{field}</small></td><td><input type="checkbox" checked={!!m.enabled} onChange={e=>patchMapping(field,{enabled:e.target.checked})}/></td><td><select value={m.column||''} onChange={e=>patchMapping(field,{column:e.target.value})}><option value="">不选择</option>{columns.map(c=><option key={c.name} value={c.name}>{c.name} · {c.type}</option>)}</select></td><td><select value={m.strategy||'if_changed'} onChange={e=>patchMapping(field,{strategy:e.target.value})}>{STRATEGIES.map(([k,n])=><option key={k} value={k}>{n}</option>)}</select></td></tr>})}
        </tbody></table></div>
        <div className="actions"><button className="primary" disabled={busy||!selected} onClick={saveSync}>保存映射</button><button disabled={busy||!selected} onClick={runPreview}>预览变化</button><button disabled={busy||!selected||sync.mode==='disabled'} onClick={apply}>立即写回已有 App</button></div>
        <p><b>自动更新说明：</b>选择“自动更新已有 App”后，后台每分钟检查一次已经解析并且 MD5 仍有效的数据；只有勾选且通过字段校验的列会被更新。</p>
      </div>

      {preview&&<div className="admin-panel"><h2>同步预览 / 结果</h2><div className="row"><b>扫描 {preview.total||0} 个</b><span>有变化 {preview.changed??preview.updated??0} · 更新 {preview.updated||0} · 跳过 {preview.skipped||0} · 失败 {preview.failed||0}</span></div>
        <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr><th align="left">App</th><th align="left">字段变化</th><th align="left">状态</th></tr></thead><tbody>{(preview.items||[]).slice(0,100).map(x=><tr key={x.appKey} style={{borderTop:'1px solid #e5e7eb',verticalAlign:'top'}}><td style={{padding:'10px 6px'}}><b>{x.appName||x.appKey}</b><br/><small>ID {x.legacyId} · {x.appKey}</small></td><td style={{padding:'10px 6px'}}>{(x.fields||[]).filter(f=>f.eligible).map(f=><div key={`${x.appKey}-${f.sourceField}`}><b>{f.label}</b> → <code>{f.column}</code>：{f.oldValue||'（空）'} → {f.newValue||'（空）'} {f.willWrite?'✓':''}</div>)}</td><td style={{padding:'10px 6px'}}>{x.status||`${x.changes||0} 项可写`}{x.error&&<><br/><small>{x.error}</small></>}</td></tr>)}</tbody></table></div>
      </div>}

      <div className="admin-panel"><h2>最近数据库写回记录</h2><p>这里记录实际执行过的 UPDATE，便于追踪哪个 IPA、哪个字段在什么时候修改了原软件源。</p>{history.length===0&&<p>暂无写回记录。</p>}{history.map((x,i)=><div className="row" key={`${x.at}-${i}`}><b>{x.appName||x.appKey} · {x.sourceSlug}</b><span>{x.at?new Date(x.at).toLocaleString():'—'} · ID {x.legacyId} · {(x.changes||[]).map(c=>`${c.label}:${c.oldValue||'空'}→${c.newValue}`).join('；')}</span></div>)}</div>
    </section>
  </div>;
}

function Stat({t,v}){return <div className="stat-card"><small>{t}</small><strong>{v}</strong></div>}
