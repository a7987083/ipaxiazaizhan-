import { Router } from 'express';
import { asyncHandler, ok, AppError } from '../utils/http.js';
import { getHome } from '../services/homeService.js';
import { listApps,getApp,listVersions } from '../repositories/appRepository.js';
import { listCategories,listTags,getSettings } from '../repositories/adminRepository.js';

const r=Router();
r.get('/home',asyncHandler(async(_req,res)=>ok(res,await getHome())));
r.get('/apps',asyncHandler(async(req,res)=>{ const result=await listApps(req.query); ok(res,result.items,{page:result.page,pageSize:result.pageSize,total:result.total,totalPages:Math.ceil(result.total/result.pageSize)}); }));
r.get('/search',asyncHandler(async(req,res)=>{ const result=await listApps({...req.query,q:req.query.q||''}); ok(res,result.items,{page:result.page,pageSize:result.pageSize,total:result.total,totalPages:Math.ceil(result.total/result.pageSize)}); }));
r.get('/apps/:id',asyncHandler(async(req,res)=>{ const app=await getApp(req.params.id,true); if(!app) throw new AppError(404,'APP_NOT_FOUND','应用不存在'); ok(res,app); }));
r.get('/apps/:id/versions',asyncHandler(async(req,res)=>{ const app=await getApp(req.params.id,true); if(!app) throw new AppError(404,'APP_NOT_FOUND','应用不存在'); ok(res,await listVersions(app.id,false)); }));
r.get('/categories',asyncHandler(async(_req,res)=>ok(res,(await listCategories()).filter(x=>x.enabled))));
r.get('/tags',asyncHandler(async(_req,res)=>ok(res,await listTags())));
r.get('/settings',asyncHandler(async(_req,res)=>ok(res,await getSettings(true))));
export default r;
