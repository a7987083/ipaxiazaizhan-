import Admin from './Admin';

export default function AdminPortal(){
  return <>
    <Admin/>
    <a href="/admin/settings" style={{position:'fixed',right:20,bottom:20,zIndex:50,padding:'11px 16px',borderRadius:12,background:'#111827',color:'#fff',textDecoration:'none',boxShadow:'0 8px 24px rgba(0,0,0,.18)'}}>设置中心</a>
  </>;
}
