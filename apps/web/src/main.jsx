import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter,Routes,Route} from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Apps from './pages/Apps';
import AppDetail from './pages/AppDetail';
import Login from './pages/Login';
import Admin from './pages/Admin';
import './styles.css';

class FatalBoundary extends React.Component{
  constructor(props){super(props);this.state={error:null};}
  static getDerivedStateFromError(error){return {error};}
  componentDidCatch(error,info){console.error('ZONOE frontend fatal error',error,info);}
  render(){
    if(this.state.error){
      return <div className="wrap state"><h2>前端启动失败</h2><p>{this.state.error?.message||'未知错误'}</p><p>请检查浏览器控制台、静态资源和反向代理配置。</p></div>;
    }
    return this.props.children;
  }
}

const root=document.getElementById('root');
if(!root) throw new Error('ROOT_ELEMENT_MISSING');
createRoot(root).render(
  <FatalBoundary>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login/>}/>
        <Route path="/admin" element={<Admin/>}/>
        <Route path="*" element={<Layout><Routes><Route path="/" element={<Home/>}/><Route path="/apps" element={<Apps/>}/><Route path="/app/:id" element={<AppDetail/>}/></Routes></Layout>}/>
      </Routes>
    </BrowserRouter>
  </FatalBoundary>
);
