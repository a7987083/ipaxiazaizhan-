const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function request(path, options={}){
  const method=String(options.method||'GET').toUpperCase();
  const isAdminGet=method==='GET'&&String(path).startsWith('/api/v1/admin/');
  const isUpdateStatusGet=isAdminGet&&String(path).startsWith('/api/v1/admin/system/update');
  const maxAttempts=isUpdateStatusGet?121:(isAdminGet?31:1);
  let lastError=null;

  for(let attempt=1;attempt<=maxAttempts;attempt++){
    try{
      const r=await fetch(path,{credentials:'include',...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
      const text=await r.text(); let data=null;
      try{data=text?JSON.parse(text):null}catch{}

      // Native updates intentionally restart zonoe-api. BaoTa/Nginx can return
      // a temporary non-JSON 502/503 while the service is rebuilding/restarting.
      // Keep retrying update-status GETs for up to ~4 minutes so the UI can stay
      // on the same page and reconnect to the new API automatically.
      if(isAdminGet&&(r.status===502||r.status===503)&&attempt<maxAttempts){
        await sleep(2000);
        continue;
      }

      if(!r.ok||!data?.ok){
        const transient=(r.status===502||r.status===503)&&text&&!data;
        const message=data?.error?.message || (r.status===429?'请求过于频繁，请稍后再试':transient?`服务正在更新/重启，暂时无法连接 API（HTTP ${r.status}）`:`HTTP ${r.status}${text&&!data?'（服务器返回了非 JSON 响应）':''}`);
        const e=new Error(message); e.status=r.status; e.code=data?.error?.code; throw e;
      }
      return data;
    }catch(e){
      lastError=e;
      if(isAdminGet&&attempt<maxAttempts&&(e instanceof TypeError||e?.status===502||e?.status===503)){
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
