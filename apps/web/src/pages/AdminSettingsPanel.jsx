import {useEffect,useState} from 'react';
import {api} from '../lib/api';

const DEFAULT_BUTTONS=[{text:'发现精彩应用',url:'/apps'}];

export default function AdminSettingsPanel(){
  const[form,setForm]=useState({site_name:'',site_notice:'',hero_title:'',hero_buttons:DEFAULT_BUTTONS}),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{api.admin('/settings').then(r=>setForm(x=>({...x,...r.data,hero_buttons:Array.isArray(r.data?.hero_buttons)?r.data.hero_buttons:DEFAULT_BUTTONS}))).catch(e=>setMsg(e.message))},[]);

  const updateButton=(index,key,value)=>setForm(prev=>({...prev,hero_buttons:(prev.hero_buttons||[]).map((b,i)=>i===index?{...b,[key]:value}:b)}));
  const addButton=()=>setForm(prev=>({...prev,hero_buttons:[...(prev.hero_buttons||[]),{text:'',url:''}]}));
  const removeButton=index=>setForm(prev=>({...prev,hero_buttons:(prev.hero_buttons||[]).filter((_,i)=>i!==index)}));

  const save=async()=>{
    setBusy(true);setMsg('');
    try{
      const buttons=(form.hero_buttons||[]).map(b=>({text:String(b?.text||'').trim(),url:String(b?.url||'').trim()}));
      const invalid=buttons.findIndex(b=>!b.text||!b.url);
      if(invalid>=0)throw new Error(`首页按钮 ${invalid+1} 的名称和地址都必须填写；不需要的按钮请直接删除。`);
      const values={site_name:form.site_name||'',site_notice:form.site_notice||'',hero_title:form.hero_title||'',hero_buttons:buttons};
      for(const [key,value] of Object.entries(values)){
        await api.admin(`/settings/${encodeURIComponent(key)}`,{method:'PUT',body:JSON.stringify({value,isPublic:true})});
      }
      setForm(prev=>({...prev,...values}));
      setMsg('站点设置和首页按钮已保存');
    }catch(e){setMsg(e.message)}finally{setBusy(false)}
  };

  return <div className="admin-panel">
    <h2>公开站点设置</h2>
    <p>首页主按钮已经改为后台管理：可以修改名称和打开地址，也可以新增多个按钮或删除任意按钮。删除全部按钮后，首页不会显示主按钮。</p>
    {msg&&<div className="toast">{msg}</div>}
    <div className="form-grid">
      <label>站点名称<input value={form.site_name||''} onChange={e=>setForm({...form,site_name:e.target.value})} placeholder="例如 ZONOE"/></label>
      <label>首页主标题<input value={form.hero_title||''} onChange={e=>setForm({...form,hero_title:e.target.value})} placeholder="首页大标题"/></label>
    </div>
    <label style={{display:'grid',gap:8,marginTop:16}}>站点公告<textarea rows="5" value={form.site_notice||''} onChange={e=>setForm({...form,site_notice:e.target.value})} placeholder="公开站点公告"/></label>

    <div style={{marginTop:22,borderTop:'1px solid #e7edf5',paddingTop:18}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,marginBottom:12}}>
        <div><h3 style={{margin:'0 0 4px'}}>首页按钮管理</h3><small style={{color:'#7a8699'}}>站内地址可填 /apps；外部地址可直接填 https:// 开头的完整网址。</small></div>
        <button type="button" onClick={addButton}>＋ 添加按钮</button>
      </div>
      {(form.hero_buttons||[]).length===0&&<div style={{padding:'14px 0',color:'#7a8699'}}>当前没有首页按钮。点击“添加按钮”即可新增。</div>}
      {(form.hero_buttons||[]).map((button,index)=><div key={index} className="row" style={{alignItems:'end'}}>
        <label style={{display:'grid',gap:6,flex:'1 1 220px',color:'#59667a',fontSize:13}}>按钮名称<input value={button?.text||''} onChange={e=>updateButton(index,'text',e.target.value)} placeholder="例如 发现精彩应用" style={{border:'1px solid #d9e2f0',background:'#fff',borderRadius:13,padding:'11px 13px'}}/></label>
        <label style={{display:'grid',gap:6,flex:'2 1 360px',color:'#59667a',fontSize:13}}>打开地址<input value={button?.url||''} onChange={e=>updateButton(index,'url',e.target.value)} placeholder="/apps 或 https://example.com" style={{border:'1px solid #d9e2f0',background:'#fff',borderRadius:13,padding:'11px 13px'}}/></label>
        <button type="button" onClick={()=>removeButton(index)} style={{marginBottom:1}}>删除</button>
      </div>)}
    </div>

    <div className="actions"><button className="primary" disabled={busy} onClick={save}>{busy?'保存中…':'保存站点设置'}</button></div>
  </div>;
}
