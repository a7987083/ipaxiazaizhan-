async function request(path, options={}){
  const r=await fetch(path,{credentials:'include',...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
  const text=await r.text(); let data=null;
  try{data=text?JSON.parse(text):null}catch{}
  if(!r.ok||!data?.ok){
    const message=data?.error?.message || (r.status===429?'请求过于频繁，请稍后再试':`HTTP ${r.status}${text&&!data?'（服务器返回了非 JSON 响应）':''}`);
    const e=new Error(message); e.status=r.status; e.code=data?.error?.code; throw e;
  }
  return data;
}
export const api={
 home:()=>request('/api/v1/home'), apps:(params={})=>request('/api/v1/apps?'+new URLSearchParams(params)), app:id=>request(`/api/v1/apps/${encodeURIComponent(id)}`), versions:id=>request(`/api/v1/apps/${encodeURIComponent(id)}/versions`), categories:()=>request('/api/v1/categories'),
 login:(username,password)=>request('/api/v1/admin/login',{method:'POST',body:JSON.stringify({username,password})}),
 admin:(path,options={})=>request('/api/v1/admin'+path,{...options,headers:{...(options.method&&options.method!=='GET'?{'x-csrf-token':document.cookie.match(/(?:^|; )zonoe_csrf=([^;]+)/)?.[1]||''}:{}),...(options.headers||{})}})
};
