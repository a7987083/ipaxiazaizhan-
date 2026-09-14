import {useEffect,useRef,useState} from 'react';
import {api} from '../lib/api';
import {Card,fmtBytes} from './AdminCorePanels';

function statusText(status){
  return ({submitted:'已提交',waiting:'等待复制',verifying:'正在核验',success:'完成',failed:'失败',timeout:'超时',partial:'部分完成',running:'进行中',skipped:'已跳过'})[status]||status||'—';
}
function verificationText(v){
  return ({md5:'MD5 一致',size:'大小一致',size_only_no_hash:'大小一致（目标盘未返回 MD5）',presence_only:'仅确认文件存在',md5_mismatch:'MD5 不一致',size_mismatch:'大小不一致',scope_changed:'OpenList 配置已变化',api_permission_error:'OpenList 权限错误',not_found:'目标未出现',waiting:'等待目标文件',incomplete_metadata:'等待验证信息'})[v]||v||'—';
}
function auditText(type){return ({copy_batch:'复制批次',copy_verify:'复制核验',copy_target_refresh:'目标盘刷新',rename:'名称修复',quarantine:'隔离'})[type]||type||'操作';}
function timeText(v){try{return v?new Date(v).toLocaleString():'—'}catch{return '—'}}

export default function AdminReplicaOperationsPanel(){
  const[data,setData]=useState(null),[note,setNote]=useState(''),[busy,setBusy]=useState(false);
  const activeRef=useRef(0);
  const load=async(silent=false)=>{try{const r=await api.admin('/openlist/replicas/operations?limit=100');setData(r.data);activeRef.current=Number(r.data?.summary?.active||0)}catch(e){if(!silent)setNote(e.message)}};
  useEffect(()=>{load()},[]);
  const active=Number(data?.summary?.active||0);
  useEffect(()=>{if(!active)return;const id=setInterval(()=>load(true),5000);return()=>clearInterval(id)},[active]);
  const verify=async()=>{setBusy(true);setNote('正在核验待完成的复制任务…');try{const r=await api.admin('/openlist/replicas/operations/verify',{method:'POST',body:JSON.stringify({limit:100})});setData(r.data?.state||data);activeRef.current=Number(r.data?.state?.summary?.active||0);setNote(`核验完成：检查 ${r.data?.checked||0} 个，新增终态 ${r.data?.terminal||0} 个。`)}catch(e){setNote(e.message)}finally{setBusy(false)}};
  const s=data?.summary||{},batches=data?.batches||[],ops=data?.operations||[],audit=data?.audit||[];
  return <div className="admin-panel">
    <h2>复制任务与操作审计</h2>
    <p>OpenList 接受 <code>/api/fs/copy</code> 后这里只记为“已提交”，不会直接当成复制完成。ZONOE 会持久跟踪任务并每 15 秒串行核验目标文件：优先比较 MD5；目标驱动没有 Hash 时明确降级为大小或存在性确认。整批进入终态后只刷新相关目标盘。</p>
    {note&&<div className="toast">{note}</div>}
    <div className="stat-grid"><Card t="进行中" v={s.active||0}/><Card t="复制完成" v={s.success||0}/><Card t="复制失败" v={s.failed||0}/><Card t="复制超时" v={s.timeout||0}/></div>
    <div className="actions"><button className="primary" disabled={busy} onClick={verify}>立即核验复制任务</button><button disabled={busy} onClick={()=>load(false)}>刷新任务/审计</button></div>

    <div className="admin-panel"><h3>最近复制批次</h3>{batches.length===0?<p>还没有复制批次。请先在“云盘副本”预览并执行一小批补齐计划。</p>:<div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr><th align="left">时间</th><th align="left">状态</th><th align="left">进度</th><th align="left">目标盘刷新</th><th align="left">批次</th></tr></thead><tbody>{batches.slice(0,30).map(b=><tr key={b.id} style={{borderTop:'1px solid #e5e7eb'}}><td style={{padding:8}}>{timeText(b.createdAt)}</td><td style={{padding:8}}><b>{statusText(b.status)}</b></td><td style={{padding:8}}>完成 {b.counts?.success||0} · 失败 {b.counts?.failed||0} · 超时 {b.counts?.timeout||0} · 进行中 {b.counts?.active||0} / {b.counts?.total||0}</td><td style={{padding:8}}>{b.refreshedAt?'已自动刷新':b.refreshError?`刷新失败：${b.refreshError}`:b.status==='running'?'等待批次结束':'等待自动刷新'}</td><td style={{padding:8}}><small>{b.id}</small></td></tr>)}</tbody></table></div>}</div>

    <div className="admin-panel"><h3>最近复制明细</h3>{ops.length===0?<p>暂无复制明细。</p>:<div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr><th align="left">IPA</th><th align="left">来源 → 目标</th><th align="left">状态</th><th align="left">校验</th><th align="left">实际信息</th><th align="left">最后检查</th></tr></thead><tbody>{ops.slice(0,100).map(x=><tr key={x.id} style={{borderTop:'1px solid #e5e7eb',verticalAlign:'top'}}><td style={{padding:8,wordBreak:'break-all'}}>{x.relativePath}</td><td style={{padding:8}}>{x.sourceLabel||`#${x.sourceStorageId}`} → {x.targetLabel||`#${x.targetStorageId}`}</td><td style={{padding:8}}><b>{statusText(x.status)}</b>{x.error?<><br/><small>{x.error}</small></>:null}</td><td style={{padding:8}}>{verificationText(x.verification)}<br/><small>{x.message||''}</small></td><td style={{padding:8}}><small>{x.actualMd5?`MD5 ${x.actualMd5}`:'MD5 —'}<br/>{x.actualSize?fmtBytes(x.actualSize):'大小 —'}</small></td><td style={{padding:8}}>{timeText(x.lastCheckedAt)}<br/><small>检查 {x.attempts||0} 次</small></td></tr>)}</tbody></table></div>}</div>

    <div className="admin-panel"><h3>最近操作审计</h3><p>这里记录副本复制批次、复制核验、目标盘自动刷新，以及名称修复和隔离操作；不会保存 OpenList Token、raw_url 或 IPA 下载直链。</p>{audit.length===0?<p>暂无审计记录。</p>:audit.slice(0,100).map(x=><div className="row" key={x.id}><span>{timeText(x.at)} · <b>{auditText(x.type)}</b>{x.relativePath?<><br/><small style={{wordBreak:'break-all'}}>{x.relativePath}</small></>:null}{x.message?<><br/><small>{x.message}</small></>:null}</span><b>{statusText(x.status)}</b></div>)}</div>
  </div>;
}
