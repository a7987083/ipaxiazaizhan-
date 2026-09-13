import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {api} from '../lib/api';

export default function Admin(){
  const[tab,setTab]=useState('dashboard'),[stats,setStats]=useState(null),[apps,setApps]=useState([]),[sources,setSources]=useState([]),[msg,setMsg]=useState('');
  const guard=p=>p.catch(e=>{if(/登录|AUTH_/.test(e.message))window.location.assign('/login');else setMsg(e.message)});
  const refresh=()=>guard(Promise.all([api.admin('/statistics'),api.admin('/apps?pageSize=100'),api.admin('/sources')]).then(([s,a,d])=>{setStats(s.data);setApps(a.data);setSources(d.data)}));
  useEffect(refresh,[]);
  const title={dashboard:'工作台',apps:'应用聚合',sources:'MySQL 软件源',settings:'站点设置',security:'修改密码',update:'在线更新'}[tab]||'后台';
  const tabs=[['dashboard','工作台'],['apps','应用'],['sources','软件源'],['settings','设置'],['security','密码'],['update','在线更新']];
  return <div className="admin-shell"><aside><div className="admin-brand">ZONOE<br/><small>后台管理</small></div>{tabs.map(([k,n])=><button className={tab===k?'active':''} key={k} onClick={()=>setTab(k)}>{n}</button>)}<Link to="/">返回前台</Link></aside><section className="admin-main"><header><h1>{title}</h1><span>应用直接读取原 MySQL 软件源，仅供查看</span></header>{msg&&<div className="toast">{msg}<button onClick={()=>setMsg('')}>×</button></div>}
  {tab==='dashboard'&&stats&&<><div className="stat-grid"><Card t="聚合 App" v={stats.totalApps}/><Card t="软件源" v={stats.totalSources}/><Card t="源内热度" v={stats.totalDownloads}/></div><div className="admin-panel"><h2>热门 App</h2>{stats.hotApps?.map((x,i)=><div className="row" key={x.id}><b>{i+1}. {x.name}</b><span>{x.source_name} · 热度 {Number(x.download_count||0).toLocaleString()}</span></div>)}</div></>}
  {tab==='apps'&&<ReadOnlyApps items={apps}/>} 
  {tab==='sources'&&<SourceManager items={sources} refresh={refresh}/>} 
  {tab==='settings'&&<Settings/>}
  {tab==='security'&&<PasswordManager/>}
  {tab==='update'&&<SystemUpdate/>}
  </section></div>
}

function Card({t,v}){return <div className="stat-card"><small>{t}</small><strong>{Number(v||0).toLocaleString()}</strong></div>}
function Input({l,k,f,s,type='text',placeholder=''}){return <label>{l}<input type={type} placeholder={placeholder} value={f[k]??''} onChange={e=>s({...f,[k]:e.target.value})}/></label>}

function ReadOnlyApps({items}){return <div className="admin-panel"><p>这里是多个 MySQL 软件源的只读聚合视图。新增/修改 App 继续在原软件源后台完成；ZONOE 仅用于查看，不提供下载。</p><div className="admin-list">{items.map(a=><div className="admin-app" key={a.id}><img src={a.icon_url||'/placeholder.svg'}/><div><b>{a.name}</b><small>{a.source_name} · 原 ID {a.legacy_id}</small><small>v{a.version||'—'} · {Number(a.file_size||0)?`${(Number(a.file_size)/1024/1024).toFixed(1)} MB`:'大小未知'}</small></div><a href={`/app/${encodeURIComponent(a.id)}`} target="_blank" rel="noreferrer">查看</a></div>)}</div></div>}

const blankSource={name:'',slug:'',host:'127.0.0.1',port:3306,database:'',username:'',password:'',table:'fa_category',priority:100,enabled:true};
function SourceManager({items,refresh}){
  const[f,setF]=useState(blankSource),[editing,setEditing]=useState(null),[note,setNote]=useState('');
  const reset=()=>{setF(blankSource);setEditing(null)};
  const edit=x=>{setEditing(x.id);setF({name:x.name,slug:x.slug,host:x.host,port:x.port,database:x.database,username:x.username,password:'',table:x.table||'fa_category',priority:x.priority,enabled:x.enabled})};
  const save=async()=>{setNote('');const body={...f,port:Number(f.port),priority:Number(f.priority),enabled:!!f.enabled,writeStats:false};if(editing&&!body.password)delete body.password;try{if(editing)await api.admin(`/sources/${editing}`,{method:'PUT',body:JSON.stringify(body)});else await api.admin('/sources',{method:'POST',body:JSON.stringify(body)});reset();await refresh()}catch(e){setNote(e.message)}};
  const test=async id=>{setNote('正在测试连接…');try{await api.admin(`/sources/${id}/test`,{method:'POST',body:'{}'});setNote('MySQL 连接正常')}catch(e){setNote(e.message)}};
  return <div className="admin-panel"><h2>{editing?'编辑 MySQL 软件源':'新增 MySQL 软件源'}</h2><p>每个数据库可以使用完全相同的 <code>fa_category</code> 表结构；内容不同没关系，系统用“软件源 + 原 ID”避免冲突。</p>{note&&<div className="toast">{note}</div>}<div className="form-grid"><Input l="名称" k="name" f={f} s={setF}/><Input l="Slug" k="slug" f={f} s={setF} placeholder="例如 app2"/><Input l="MySQL Host" k="host" f={f} s={setF}/><Input l="Port" k="port" f={f} s={setF}/><Input l="Database" k="database" f={f} s={setF}/><Input l="Username" k="username" f={f} s={setF}/><Input l={editing?'Password（留空不修改）':'Password'} k="password" f={f} s={setF} type="password"/><Input l="应用表" k="table" f={f} s={setF}/><Input l="优先级" k="priority" f={f} s={setF}/><label>启用<input type="checkbox" checked={!!f.enabled} onChange={e=>setF({...f,enabled:e.target.checked})}/></label></div><div className="actions">{editing&&<button onClick={reset}>取消</button>}<button className="primary" onClick={save}>{editing?'保存修改':'新增软件源'}</button></div><h2>已配置软件源</h2>{items.map(x=><div className="row" key={x.id}><b>{x.name}</b><span>{x.enabled?'启用':'停用'} · {x.host}:{x.port}/{x.database} · {x.table}</span><button onClick={()=>test(x.id)}>测试</button><button onClick={()=>edit(x)}>编辑</button><button onClick={async()=>{if(confirm(`确定删除软件源 ${x.name}？不会删除原数据库数据。`)){await api.admin(`/sources/${x.id}`,{method:'DELETE'});refresh()}}}>删除</button></div>)}</div>}

function Settings(){const[k,setK]=useState('site_notice'),[v,setV]=useState(''),[m,setM]=useState('');return <div className="admin-panel"><p>修改公开站点设置。常用 key：site_name、site_notice、hero_title。</p>{m&&<div className="toast">{m}</div>}<div className="inline-form"><input value={k} onChange={e=>setK(e.target.value)}/><input value={v} onChange={e=>setV(e.target.value)} placeholder="值"/><button className="primary" onClick={async()=>{try{await api.admin(`/settings/${k}`,{method:'PUT',body:JSON.stringify({value:v,isPublic:true})});setM('保存成功')}catch(e){setM(e.message)}}}>保存</button></div></div>}

function PasswordManager(){const[f,setF]=useState({currentPassword:'',newPassword:'',confirmPassword:''}),[m,setM]=useState('');const submit=async()=>{setM('');if(f.newPassword!==f.confirmPassword)return setM('两次输入的新密码不一致');try{await api.admin('/account/password',{method:'POST',body:JSON.stringify(f)});alert('密码修改成功，请重新登录');window.location.assign('/login')}catch(e){setM(e.message)}};return <div className="admin-panel"><h2>修改管理员密码</h2><p>修改成功后当前登录会话立即失效；以后升级不会用 .env 里的初始密码覆盖新密码。</p>{m&&<div className="toast">{m}</div>}<div className="form-grid"><Input l="当前密码" k="currentPassword" f={f} s={setF} type="password"/><Input l="新密码（至少 10 位）" k="newPassword" f={f} s={setF} type="password"/><Input l="确认新密码" k="confirmPassword" f={f} s={setF} type="password"/></div><div className="actions"><button className="primary" onClick={submit}>修改密码</button></div></div>}

function SystemUpdate(){
  const[info,setInfo]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const load=async(silent=false)=>{if(!silent)setLoading(true);try{const r=await api.admin('/system/update');setInfo(r.data);setError('')}catch(e){if(!silent)setError(e.message)}finally{if(!silent)setLoading(false)}};
  useEffect(()=>{load()},[]);
  useEffect(()=>{if(!['queued','running'].includes(info?.status?.state))return;const id=setInterval(()=>load(true),2500);return()=>clearInterval(id)},[info?.status?.state]);
  const start=async()=>{if(!window.confirm('确定立即从 GitHub 在线更新？更新前会自动备份，更新过程中后台会短暂断开。'))return;setError('');try{const r=await api.admin('/system/update',{method:'POST',body:'{}'});setInfo(x=>({...x,status:r.data}));setTimeout(()=>load(true),1000)}catch(e){setError(e.message)}};
  const state=info?.status?.state||'idle';const running=['queued','running'].includes(state);const updateLabel=running?'正在更新…':info?.hasUpdate?`更新到 ${info.latestVersion}`:info?.localAhead?'当前为预览/开发版':'已是最新版本';
  return <div className="admin-panel"><h2>GitHub 在线更新</h2><p>检查版本并直接更新。任务由独立 root systemd updater 执行，Web API 本身不拥有 root 权限；只允许向更高版本前进。</p>{loading&&<p>正在检查 GitHub...</p>}{error&&<div className="toast">{error}</div>}{info&&<><div className="row"><b>当前版本</b><span>{info.currentVersion}</span></div><div className="row"><b>最新版本</b><span>{info.latestVersion||'暂未获取'}</span></div><div className="row"><b>更新通道</b><span>{info.channel} · {info.repository}</span></div><div className="row"><b>任务状态</b><span>{state} · {info.status?.message||'—'}</span></div>{info.localAhead&&<p>当前安装的是高于 Stable 的开发/预览版本，后台不会自动降级。</p>}{info.remoteError&&<p className="error">GitHub 检查失败：{info.remoteError}</p>}{info.release?.notes&&<div style={{margin:'16px 0',whiteSpace:'pre-wrap',maxHeight:240,overflow:'auto'}}><b>更新说明</b><p>{info.release.notes}</p></div>}<div className="actions"><button onClick={()=>load()} disabled={running}>检查更新</button><button className="primary" onClick={start} disabled={running||!info.hasUpdate}>{updateLabel}</button></div>{state==='success'&&<p>更新完成。建议刷新后台页面。</p>}{state==='failed'&&<p className="error">{info.status?.message||'更新失败'}。服务器日志：data/update-runtime/admin-update.log</p>}</>}</div>
}
