import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

const webRoot=fileURLToPath(new URL('../apps/web/',import.meta.url));
const vite=await createServer({root:webRoot,server:{middlewareMode:true},appType:'custom',logLevel:'error'});
try{
  const routes=[
    ['/login','/src/pages/Login.jsx','ZONOE 后台'],
    ['/admin','/src/pages/Admin.jsx','后台管理'],
  ];
  for(const [path,modulePath,marker] of routes){
    const mod=await vite.ssrLoadModule(modulePath);
    const html=renderToString(React.createElement(MemoryRouter,{initialEntries:[path]},React.createElement(mod.default)));
    if(!html.includes(marker)) throw new Error(`FRONTEND_ROUTE_SMOKE_FAILED:${path}`);
    console.log(`[frontend-smoke] ${path} ok`);
  }
}finally{
  await vite.close();
}
