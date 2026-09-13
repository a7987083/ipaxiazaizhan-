const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function request(path, options={}){
  const method=String(options.method||'GET').toUpperCase();
  const retryAdminGet=method==='GET'&&String(path).startsWith('/api/v1/admin/');
  const maxAttempts=retryAdminGet?31:1;
  let lastError=null;

  for(let attempt=1;attempt<=maxAttempts;attempt++){
    try{
      const r=await fetch(path,{credentials:'include',...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
      const text=await r.text(); let data=null;
      try{data=text?JSON.parse(text):null}catch{}

      // During a native online update, zonoe-api is intentionally restarted.
      // BaoTa/Nginx returns a non-JSON 502/503 in that short window. Treat it
      // as transient for authenticated admin GET requests instead of surfacing
      // a scary updater error immediately.
      if(retryAdminGet&&(r.status===502||r.status===503)&&attempt<maxAttempts){
        await sleep(2000);
        continue;
      }

      if(!r.ok||!data?.ok){
        const transient=(r.status===502||r.status===503)&&text&&!data;
        const message=data?.error?.message || (r.status===429?'请求过于频繁，请稍后再试':transient?`服务正在重启或 API 尚未恢复（HTTP ${r.status}）`:`HTTP ${r.status}${text&&!data?'（服务器返回了非 JSON 响应）':''}`);
        const e=new Error(message); e.status=r.status; e.code=data?.error?.code; throw e;
      }
      return data;
    }catch(e){
      lastError=e;
      // A restart can also briefly produce a fetch/network error before Nginx
      // answers again. Retry only idempotent admin GETs.
      if(retryAdminGet&&attempt<maxAttempts&&(e instanceof TypeError||e?.status===502||e?.status===503)){
        await sleep(2000);
        continue;
      }
      throw e;
    }
  }
  throw lastError||new Error('API 请求失败');
}
export const api={
 home:()=>request('/api/v1/home'), apps:(params={})=>request('/api/v1/apps?'+new URLSearchParams(params)), app:id=>request(`/api/v1/apps/${encodeURIComponent(id)}`), versions:id=>request(`/api/v1/apps/${encodeURIComponent(id)}/versions`), categories:()=>request('/api/v1/categories'),
 login:(username,password)=>request('/api/v1/admin/login',{method:'POST',body:JSON.stringify({username,password})}),
 admin:(path,options={})=>request('/api/v1/admin'+path,{...options,headers:{...(options.method&&options.method!=='GET'?{'x-csrf-token':document.cookie.match(/(?:^|; )zonoe_csrf=([^;]+)/)?.[1]||''}:{}),...(options.headers||{})}})
};
