import {useEffect,useState} from 'react';
import {api} from '../lib/api';

export default function Admin(){
  const[tab,setTab]=useState('dashboard'),[stats,setStats]=useState(null),[apps,setApps]=useState([]),[sources,setSources]=useState([]),[msg,setMsg]=useState('');
  const guard=p=>p.catch(e=>{if(/登录|AUTH_/.test(e.message))window.location.assign('/login');else setMsg(e.message)});
  const refresh=()=>guard(Promise.all([api.admin('/statistics'),api.admin('/apps?pageSize=100'),api.admin('/sources')]).then(([s,a,d])=>{setStats(s.data);setApps(a.data);setSources(d.data)}));
  useEffect(refresh,[]);
  const title={dashboard:'工作台',apps:'应用聚合',sources:'MySQL 软件源',openlist:'IPA 元数据',settings:'站点设置',security:'修改密码',update:'在线更新'}[tab]||'后台';
  const tabs=[['dashboard','工作台'],['apps','应用'],['sources','软件源'],['openlist','IPA 元数据'],['settings','设置'],['security','密码'],['update','在线更新']];
  return <div className="admin-shell"><aside><div className="admin-brand">ZONOE<br/><small>后台管理</small></div>{tabs.map(([k,n])=><button className={tab===k?'active':''} key={k} onClick={()=>setTab(k)}>{n}</button>)}<a href="/">返回前台</a></aside><section className="admin-main"><header><h1>{title}</h1><span>应用直接读取原 MySQL 软件源，仅供查看</span></header>{msg&&<div className="toast">{msg}<button onClick={()=>setMsg('')}>×</button></div>}
  {tab==='dashboard'&&stats&&<><div className="stat-grid"><Card t="聚合 App" v={stats.totalApps}/><Card t="软件源" v={stats.totalSources}/><Card t="源内热度" v={stats.totalDownloads}/></div><div className="admin-panel"><h2>热门 App</h2>{stats.hotApps?.map((x,i)=><div className="row" key={x.id}><b>{i+1}. {x.name}</b><span>{x.source_name} · 热度 {Number(x.download_count||0).toLocaleString()}</span></div>)}</div></>}
  {tab==='apps'&&<ReadOnlyApps items={apps}/>} 
  {tab==='sources'&&<SourceManager items={sources} refresh={refresh}/>} 
  {tab==='openlist'&&<OpenListManager/>}
  {tab==='settings'&&<Settings/>}
  {tab==='security'&&<PasswordManager/>}
  {tab==='update'&&<SystemUpdate/>}
  </section></div>
}

function Card({t,v}){return <div className="stat-card"><small>{t}</small><strong>{Number(v||0).toLocaleString()}</strong></div>}
function Input({l,k,f,s,type='text',placeholder=''}){return <label>{l}<input type={type} placeholder={placeholder} value={f[k]??''} onChange={e=>s({...f,[k]:e.target.value})}/></label>}

function ReadOnlyApps({items}){return <div className="admin-panel"><p>这里是多个 MySQL 软件源的只读聚合视图。新增/修改 App 继续在原软件源后台完成；ZONOE 仅用于查看，不提供下载。</p><div className="admin-list">{items.map(a=><div className="admin-app" key={a.id}><img src={a.icon_url||'/placeholder.svg'}/><div><b>{a.name}</b><small>{a.source_name} · 原 ID {a.legacy_id}</small><small>v{a.version||'—'} · {Number(a.file_size||0)?`${(Number(a.file_size)/1024/1024).toFixed(1)} MB`:'大小未知'}{a.package_version?` · IPA ${a.package_version}`:''}</small></div><a href={`/app/${encodeURIComponent(a.id)}`} target="_blank" rel="noreferrer">查看</a></div>)}</div></div>}

const blankSource={name:'',slug:'',host:'127.0.0.1',port:3306,database:'',username:'',password:'',table:'fa_category',priority:100,enabled:true};
function SourceManager({items,refresh}){
  const[f,setF]=useState(blankSource),[editing,setEditing]=useState(null),[note,setNote]=useState('');
  const reset=()=>{setF(blankSource);setEditing(null)};
  const edit=x=>{setEditing(x.id);setF({name:x.name,slug:x.slug,host:x.host,port:x.port,database:x.database,username:x.username,password:'',table:x.table||'fa_category',priority:x.priority,enabled:x.enabled})};
  const save=async()=>{setNote('');const body={...f,port:Number(f.port),priority:Number(f.priority),enabled:!!f.enabled,writeStats:false};if(editing&&!body.password)delete body.password;try{if(editing)await api.admin(`/sources/${editing}`,{method:'PUT',body:JSON.stringify(body)});else await api.admin('/sources',{method:'POST',body:JSON.stringify(body)});reset();await refresh()}catch(e){setNote(e.message)}};
  const test=async id=>{setNote('正在测试连接…');try{await api.admin(`/sources/${id}/test`,{method:'POST',body:'{}'});setNote('MySQL 连接正常')}catch(e){setNote(e.message)}};
  return <div className="admin-panel"><h2>{editing?'编辑 MySQL 软件源':'新增 MySQL 软件源'}</h2><p>每个数据库可以使用完全相同的 <code>fa_category</code> 表结构；内容不同没关系，系统用“软件源 + 原 ID”避免冲突。</p>{note&&<div className="toast">{note}</div>}<div className="form-grid"><Input l="名称" k="name" f={f} s={setF}/><Input l="Slug" k="slug" f={f} s={setF} placeholder="例如 app2"/><Input l="MySQL Host" k="host" f={f} s={setF}/><Input l="Port" k="port" f={f} s={setF}/><Input l="Database" k="database" f={f} s={setF}/><Input l="Username" k="username" f={f} s={setF}/><Input l={editing?'Password（留空不修改）':'Password'} k="password" f={f} s={setF} type="password"/><Input l="应用表" k="table" f={f} s={setF}/><Input l="优先级" k="priority" f={f} s={setF}/><label>启用<input type="checkbox" checked={!!f.enabled} onChange={e=>setF({...f,enabled:e.target.checked})}/></label></div><div className="actions">{editing&&<button onClick={reset}>取消</button>}<button className="primary" onClick={save}>{editing?'保存修改':'新增软件源'}</button></div><h2>已配置软件源</h2>{items.map(x=><div className="row" key={x.id}><b>{x.name}</b><span>{x.enabled?'启用':'停用'} · {x.host}:{x.port}/{x.database} · {x.table}</span><button onClick={()=>test(x.id)}>测试</button><button onClick={()=>edit(x)}>编辑</button><button onClick={async()=>{if(confirm(`确定删除软件源 ${x.name}？不会删除原数据库数据。`)){await api.admin(`/sources/${x.id}`,{method:'DELETE'});refresh()}}}>删除</button></div>)}</div>}

function OpenListManager(){
  const[info,setInfo]=useState(null),[f,setF]=useState({url:'https://yun.zonoeios.xyz',token:'',publicPathPrefix:'/d/a/app/',apiBasePath:'/',enabled:true}),[note,setNote]=useState(''),[busy,setBusy]=useState(false);
  const load=async()=>{try{const r=await api.admin('/openlist');setInfo(r.data);const c=r.data?.config||{};setF(x=>({...x,url:c.url||x.url,publicPathPrefix:c.publicPathPrefix||'/d/a/app/',apiBasePath:c.apiBasePath||'/',enabled:c.enabled!==false,token:''}))}catch(e){setNote(e.message)}};
  useEffect(()=>{load()},[]);
  const save=async()=>{setBusy(true);setNote('');try{const body={url:f.url,publicPathPrefix:f.publicPathPrefix,apiBasePath:f.apiBasePath,enabled:!!f.enabled};if(f.token.trim())body.token=f.token.trim();await api.admin('/openlist',{method:'PUT',body:JSON.stringify(body)});setNote('OpenList 配置已保存，Token 已加密保存且不会回显');await load()}catch(e){setNote(e.message)}finally{setBusy(false)}};
  const test=async()=>{setBusy(true);setNote('正在测试 OpenList…');try{const r=await api.admin('/openlist/test',{method:'POST',body:'{}'});setNote(`连接正常 · 目录条目 ${Number(r.data.total||0).toLocaleString()} · ${r.data.provider||'unknown'}`)}catch(e){setNote(e.message)}finally{setBusy(false)}};
  const sync=async parseLimit=>{if(parseLimit>0&&!confirm(`将先用 MD5 对比，只对新增/变化文件最多解析 ${parseLimit} 个 IPA。继续？`))return;setBusy(true);setNote(parseLimit?'正在扫描并增量解析…':'正在扫描 OpenList MD5，不读取 IPA 内容…');try{const r=await api.admin('/openlist/sync',{method:'POST',body:JSON.stringify({parseLimit})});const x=r.data;setNote(`完成：引用 ${x.databaseRefs}，唯一文件 ${x.uniqueFiles}，未变化 ${x.unchangedFiles}，新增 ${x.newFiles}，变化 ${x.changedFiles}，本次解析 ${x.parsedNow}，待解析 ${x.pendingParse}`);await load()}catch(e){setNote(e.message)}finally{setBusy(false)}};
  const c=info?.cache||{},s=c.lastSync;
  return <div className="admin-panel"><h2>OpenList IPA 元数据</h2><p>只在后台读取 MySQL 的 IPA 地址用于匹配 OpenList；前台不会返回 <code>bt1a</code>、OpenList Token 或 <code>raw_url</code>。同步先批量比较 OpenList MD5，只有新增/变化文件才进入 IPA Range 解析。</p>{note&&<div className="toast">{note}</div>}<div className="form-grid"><Input l="OpenList URL" k="url" f={f} s={setF}/><Input l={info?.config?.tokenConfigured?'Token（留空不修改）':'只读 Token'} k="token" f={f} s={setF} type="password"/><Input l="公开下载路径前缀" k="publicPathPrefix" f={f} s={setF}/><Input l="API Base Path" k="apiBasePath" f={f} s={setF}/><label>启用<input type="checkbox" checked={!!f.enabled} onChange={e=>setF({...f,enabled:e.target.checked})}/></label></div><div className="actions"><button className="primary" disabled={busy} onClick={save}>保存配置</button><button disabled={busy||!info?.config?.tokenConfigured} onClick={test}>测试连接</button><button disabled={busy||!info?.config?.tokenConfigured} onClick={()=>sync(0)}>仅扫描 MD5</button><button disabled={busy||!info?.config?.tokenConfigured} onClick={()=>sync(5)}>扫描并解析 5 个</button></div><div className="stat-grid"><Card t="缓存文件" v={c.files}/><Card t="已解析" v={c.parsed}/><Card t="待解析" v={c.pending}/><Card t="解析失败" v={c.failed}/></div>{s&&<div className="admin-panel"><h3>上次同步</h3><div className="row"><b>{new Date(s.finishedAt).toLocaleString()}</b><span>数据库引用 {s.databaseRefs} · 唯一 IPA {s.uniqueFiles} · 找到 {s.foundFiles} · 缺失 {s.missingFiles}</span></div><div className="row"><b>MD5 对比</b><span>未变化 {s.unchangedFiles} · 新增 {s.newFiles} · 变化 {s.changedFiles} · 忽略地址 {s.ignoredRefs}</span></div></div>}{c.sample?.length>0&&<><h3>最近解析结果</h3>{c.sample.map((x,i)=><div className="row" key={`${x.bundle_id}-${i}`}><b>{x.name||'未命名'} · {x.version||'—'} ({x.build||'—'})</b><span>{x.bundle_id||'—'} · iOS {x.minimum_ios||'—'} · {(Number(x.size||0)/1024/1024).toFixed(1)} MB</span></div>)}</>}</div>
}

function Settings(){const[k,setK]=useState('site_notice'),[v,setV]=useState(''),[m,setM]=useState('');return <div className="admin-panel"><p>修改公开站点设置。常用 key：site_name、site_notice、hero_title。</p>{m&&<div className="toast">{m}</div>}<div className="inline-form"><input value={k} onChange={e=>setK(e.target.value)}/><input value={v} onChange={e=>setV(e.target.value)} placeholder="值"/><button className="primary" onClick={async()=>{try{await api.admin(`/settings/${k}`,{method:'PUT',body:JSON.stringify({value:v,isPublic:true})});setM('保存成功')}catch(e){setM(e.message)}}}>保存</button></div></div>}

function PasswordManager(){const[f,setF]=useState({currentPassword:'',newPassword:'',confirmPassword:''}),[m,setM]=useState('');const submit=async()=>{setM('');if(f.newPassword!==f.confirmPassword)return setM('两次输入的新密码不一致');try{await api.admin('/account/password',{method:'POST',body:JSON.stringify(f)});alert('密码修改成功，请重新登录');window.location.assign('/login')}catch(e){setM(e.message)}};return <div className="admin-panel"><h2>修改管理员密码</h2><p>修改成功后当前登录会话立即失效；以后升级不会用 .env 里的初始密码覆盖新密码。</p>{m&&<div className="toast">{m}</div>}<div className="form-grid"><Input l="当前密码" k="currentPassword" f={f} s={setF} type="password"/><Input l="新密码（至少 10 位）" k="newPassword" f={f} s={setF} type="password"/><Input l="确认新密码" k="confirmPassword" f={f} s={setF} type="password"/></div><div className="actions"><button className="primary" onClick={submit}>修改密码</button></div></div>}

function SystemUpdate(){
  const[info,setInfo]=useState(null),[channel,setChannel]=useState('preview'),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const load=async(silent=false)=>{if(!silent)setLoading(true);try{const r=await api.admin('/system/update');setInfo(r.data);setChannel(c=>r.data?.channels?.[c]?c:(r.data?.defaultChannel||'preview'));setError('')}catch(e){if(!silent)setError(e.message)}finally{if(!silent)setLoading(false)}};
  useEffect(()=>{load()},[]);
  useEffect(()=>{if(!['queued','running'].includes(info?.status?.state))return;const id=setInterval(()=>load(true),2500);return()=>clearInterval(id)},[info?.status?.state]);
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
  const label=running?'正在更新…':selected?.hasUpdate?`一键更新到 ${selected.latestVersion}`:selected?.localAhead?'当前版本更高，禁止降级':'该通道已是最新';
  const stable=info?.channels?.stable,preview=info?.channels?.preview;
  return <div className="admin-panel"><h2>GitHub 在线更新</h2><p>稳定版来自 GitHub Stable Release；预览版固定跟随 <code>{info?.previewRef||'feature/baota-native-deploy-v1'}</code> 最近一次通过 CI 的构建。两个通道都只允许向更高版本前进。</p>{loading&&<p>正在检查 Stable 和 Preview...</p>}{error&&<div className="toast">{error}</div>}{info&&<><div className="row"><b>当前版本</b><span>{info.currentVersion}</span></div><div className="row"><b>Stable 最新</b><span>{stable?.latestVersion||'暂未获取'}{stable?.error?` · ${stable.error}`:''}</span></div><div className="row"><b>Preview 最新</b><span>{preview?.latestVersion||'暂未获取'}{preview?.error?` · ${preview.error}`:''}</span></div><div className="row"><b>更新通道</b><select value={channel} disabled={running} onChange={e=>setChannel(e.target.value)} style={{minWidth:260,padding:'8px 10px',border:'1px solid #dce5f2',borderRadius:10,background:'#fff'}}><option value="preview">预览版 Preview</option><option value="stable">稳定版 Stable Release</option></select></div><div className="row"><b>目标版本</b><span>{selected?.latestVersion||'暂未获取'}</span></div><div className="row"><b>任务状态</b><span>{state} · {info.status?.message||'—'}{info.status?.channel?` · ${info.status.channel}`:''}</span></div>{selected?.localAhead&&<p>当前版本高于所选通道，系统会阻止降级。</p>}{selected?.notes&&<div style={{margin:'16px 0',whiteSpace:'pre-wrap',maxHeight:240,overflow:'auto'}}><b>更新说明</b><p>{selected.notes}</p></div>}<div className="actions"><button onClick={()=>load()} disabled={running}>检查两个通道</button><button className="primary" onClick={start} disabled={running||!selected?.hasUpdate}>{label}</button></div>{state==='success'&&<p>更新完成，当前版本会自动刷新；如页面静态资源已更新，请再刷新一次浏览器。</p>}{state==='failed'&&<p className="error">{info.status?.message||'更新失败'}。服务器日志：data/update-runtime/admin-update.log</p>}</>}</div>
}
