import {useEffect,useState} from 'react';
import {api} from '../lib/api';

export default function AdminSettingsPanel(){
  const[form,setForm]=useState({site_name:'',site_notice:'',hero_title:''}),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{api.admin('/settings').then(r=>setForm(x=>({...x,...r.data}))).catch(e=>setMsg(e.message))},[]);
  const save=async()=>{setBusy(true);setMsg('');try{const r=await api.admin('/settings',{method:'PUT',body:JSON.stringify(form)});setForm(x=>({...x,...r.data}));setMsg('站点设置已全部保存')}catch(e){setMsg(e.message)}finally{setBusy(false)}};
  return <div className="admin-panel"><h2>公开站点设置</h2><p>这里已经改成中文表单，不需要再记 <code>site_name</code>、<code>site_notice</code>、<code>hero_title</code>。三个项目会一次保存。</p>{msg&&<div className="toast">{msg}</div>}<div className="form-grid"><label>站点名称<input value={form.site_name||''} onChange={e=>setForm({...form,site_name:e.target.value})} placeholder="例如 ZONOE"/></label><label>首页主标题<input value={form.hero_title||''} onChange={e=>setForm({...form,hero_title:e.target.value})} placeholder="首页大标题"/></label></div><label style={{display:'grid',gap:8,marginTop:16}}>站点公告<textarea rows="5" value={form.site_notice||''} onChange={e=>setForm({...form,site_notice:e.target.value})} placeholder="公开站点公告"/></label><div className="actions"><button className="primary" disabled={busy} onClick={save}>{busy?'保存中…':'保存站点设置'}</button></div></div>
}
