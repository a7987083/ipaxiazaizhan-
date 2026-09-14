import {useEffect,useState} from 'react';
import {api} from '../lib/api';
import {
  DashboardPanel,AppsPanel,SourceManager,PasswordManager
} from './AdminCorePanels';
import AdminOpenListPanel from './AdminOpenListPanel';
import AdminReplicaPanel from './AdminReplicaPanel';
import AdminReplicaOperationsPanel from './AdminReplicaOperationsPanel';
import AdminUpdaterPanel from './AdminUpdaterPanel';
import AdminSettingsPanel from './AdminSettingsPanel';
import AdminCachePanel from './AdminCachePanel';
import AdminWriteBackPanel from './AdminWriteBackPanel';

export default function Admin(){
  const[tab,setTab]=useState('dashboard'),[stats,setStats]=useState(null),[apps,setApps]=useState([]),[sources,setSources]=useState([]),[msg,setMsg]=useState('');
  const guard=p=>p.catch(e=>{if(/登录|AUTH_/.test(e.message))window.location.assign('/login');else setMsg(e.message)});
  const refresh=()=>guard(Promise.all([api.admin('/statistics'),api.admin('/apps?pageSize=100'),api.admin('/sources')]).then(([s,a,d])=>{setStats(s.data);setApps(a.data);setSources(d.data)}));
  useEffect(refresh,[]);
  const title={dashboard:'工作台',apps:'应用聚合',sources:'MySQL 软件源',openlist:'IPA 元数据',replicas:'云盘副本',replicaops:'副本任务',writeback:'数据同步',settings:'站点设置',cache:'本地缓存',security:'修改密码',update:'在线更新'}[tab]||'后台';
  const tabs=[['dashboard','工作台'],['apps','应用'],['sources','软件源'],['openlist','IPA 元数据'],['replicas','云盘副本'],['replicaops','副本任务'],['writeback','数据同步'],['settings','站点设置'],['cache','本地缓存'],['security','密码'],['update','在线更新']];
  return <div className="admin-shell"><aside><div className="admin-brand">ZONOE<br/><small>后台管理</small></div>{tabs.map(([k,n])=><button className={tab===k?'active':''} key={k} onClick={()=>setTab(k)}>{n}</button>)}<a href="/">返回前台</a></aside><section className="admin-main"><header><h1>{title}</h1><span>软件源默认只读；数据库写回和云盘写操作都必须明确开启权限</span></header>{msg&&<div className="toast">{msg}<button onClick={()=>setMsg('')}>×</button></div>}
  {tab==='dashboard'&&<DashboardPanel stats={stats}/>} 
  {tab==='apps'&&<AppsPanel items={apps}/>} 
  {tab==='sources'&&<SourceManager items={sources} refresh={refresh}/>} 
  {tab==='openlist'&&<AdminOpenListPanel/>}
  {tab==='replicas'&&<AdminReplicaPanel/>}
  {tab==='replicaops'&&<AdminReplicaOperationsPanel/>}
  {tab==='writeback'&&<AdminWriteBackPanel sources={sources}/>} 
  {tab==='settings'&&<AdminSettingsPanel/>}
  {tab==='cache'&&<AdminCachePanel/>}
  {tab==='security'&&<PasswordManager/>}
  {tab==='update'&&<AdminUpdaterPanel/>}
  </section></div>
}
