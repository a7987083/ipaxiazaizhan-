async function request(path, options={}){
  const r=await fetch(path,{credentials:'include',...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
  const data=await r.json().catch(()=>({ok:false,error:{message:'响应解析失败'}}));
  if(!r.ok||!data.ok) throw new Error(data?.error?.message||`HTTP ${r.status}`); return data;
}
export const api={
 home:()=>request('/api/v1/home'), apps:(params={})=>request('/api/v1/apps?'+new URLSearchParams(params)), app:id=>request(`/api/v1/apps/${id}`), versions:id=>request(`/api/v1/apps/${id}/versions`), categories:()=>request('/api/v1/categories'),
 login:(username,password)=>request('/api/v1/admin/login',{method:'POST',body:JSON.stringify({username,password})}),
 admin:(path,options={})=>request('/api/v1/admin'+path,{...options,headers:{...(options.method&&options.method!=='GET'?{'x-csrf-token':document.cookie.match(/(?:^|; )zonoe_csrf=([^;]+)/)?.[1]||''}:{}),...(options.headers||{})}})
};
