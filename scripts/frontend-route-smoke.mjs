import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
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

  const layoutMod=await vite.ssrLoadModule('/src/components/Layout.jsx');
  const publicHtml=renderToString(
    React.createElement(MemoryRouter,{initialEntries:['/']},
      React.createElement(Routes,null,
        React.createElement(Route,{element:React.createElement(layoutMod.default)},
          React.createElement(Route,{index:true,element:React.createElement('div',null,'PUBLIC_ROUTE_OK')})
        )
      )
    )
  );
  if(!publicHtml.includes('PUBLIC_ROUTE_OK')||!publicHtml.includes('ZONOE')) throw new Error('FRONTEND_PUBLIC_LAYOUT_SMOKE_FAILED');
  console.log('[frontend-smoke] public layout ok');
}finally{
  await vite.close();
}
