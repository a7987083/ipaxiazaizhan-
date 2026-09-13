import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin,requireCsrf } from '../middleware/auth.js';
import { asyncHandler,ok,AppError } from '../utils/http.js';
import * as admin from '../repositories/adminRepository.js';
import { getLocalCacheStatus,clearLocalCache } from '../services/cacheManagementService.js';
import {
  getSourceWriteBack,saveSourceWriteBack,previewSourceWriteBack,applySourceWriteBack,getWriteBackHistory
} from '../services/ipaWriteBackService.js';

const r=Router();
r.use(requireAdmin,requireCsrf);

const siteSettingsSchema=z.object({
  site_name:z.string().min(1).max(120),
  site_notice:z.string().max(2000).default(''),
  hero_title:z.string().min(1).max(240)
});
r.put('/settings',asyncHandler(async(req,res)=>{
  const p=siteSettingsSchema.parse(req.body||{});
  for(const [key,value] of Object.entries(p))await admin.setSetting(key,value,true);
  ok(res,await admin.getSettings(false));
}));

r.get('/cache',asyncHandler(async(_req,res)=>ok(res,await getLocalCacheStatus())));
r.post('/cache/clear',asyncHandler(async(req,res)=>{
  const p=z.object({target:z.enum(['directory','failed','ipa','all'])}).parse(req.body||{});
  try{ok(res,await clearLocalCache(p.target))}
  catch(e){
    if(e?.code==='CACHE_TASK_BUSY')throw new AppError(409,e.code,e.message);
    if(e?.code==='CACHE_TARGET_INVALID')throw new AppError(400,e.code,e.message);
    throw e;
  }
}));

r.get('/sources/:id/writeback',asyncHandler(async(req,res)=>{
  const x=await getSourceWriteBack(Number(req.params.id));
  if(!x)throw new AppError(404,'SOURCE_NOT_FOUND','软件源不存在');
  ok(res,x);
}));
r.put('/sources/:id/writeback',asyncHandler(async(req,res)=>{
  try{
    const x=await saveSourceWriteBack(Number(req.params.id),req.body||{});
    if(!x)throw new AppError(404,'SOURCE_NOT_FOUND','软件源不存在');
    ok(res,x);
  }catch(e){
    if(e?.code==='WRITEBACK_CONFIG_INVALID')throw new AppError(400,e.code,e.message,e.details);
    throw e;
  }
}));
r.get('/sources/:id/writeback/preview',asyncHandler(async(req,res)=>{
  const p=z.object({
    limit:z.coerce.number().int().min(1).max(200).default(50),
    after:z.string().optional().default('')
  }).parse(req.query||{});
  const x=await previewSourceWriteBack(Number(req.params.id),{limit:p.limit,afterAppKey:p.after});
  if(!x)throw new AppError(404,'SOURCE_NOT_FOUND','软件源不存在');
  ok(res,x);
}));
r.post('/sources/:id/writeback/apply',asyncHandler(async(req,res)=>{
  const p=z.object({
    limit:z.coerce.number().int().min(1).max(200).default(50),
    after:z.string().optional().default(''),
    appKeys:z.array(z.string().min(1)).max(200).optional().default([])
  }).parse(req.body||{});
  try{
    const x=await applySourceWriteBack(Number(req.params.id),{limit:p.limit,afterAppKey:p.after,appKeys:p.appKeys,mode:'manual'});
    if(!x)throw new AppError(404,'SOURCE_NOT_FOUND','软件源不存在');
    ok(res,x);
  }catch(e){
    if(e?.code==='WRITEBACK_DISABLED')throw new AppError(409,e.code,e.message);
    if(e?.code==='WRITEBACK_CONFIG_INVALID')throw new AppError(400,e.code,e.message);
    throw e;
  }
}));
r.get('/sources/:id/writeback/history',asyncHandler(async(req,res)=>{
  const p=z.object({limit:z.coerce.number().int().min(1).max(200).default(50)}).parse(req.query||{});
  const x=await getWriteBackHistory(Number(req.params.id),{limit:p.limit});
  if(!x)throw new AppError(404,'SOURCE_NOT_FOUND','软件源不存在');
  ok(res,x);
}));

export default r;
