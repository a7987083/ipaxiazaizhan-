import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { asyncHandler,ok,AppError } from '../utils/http.js';
import { csrfToken } from '../utils/crypto.js';
import { login,changePassword } from '../services/authService.js';
import { getOnlineUpdateStatus,queueOnlineUpdate } from '../services/updateService.js';
import { getOpenListIpaStatus,syncOpenListIpaMetadata,testOpenListConnection } from '../services/openListMetadataService.js';
import { testMysqlSource } from '../services/mysqlCli.js';
import { getMysqlSource,saveOpenListConfig } from '../storage/controlStore.js';
import { loginLimiter } from '../middleware/rateLimit.js';
import { requireAdmin,requireCsrf } from '../middleware/auth.js';
import * as apps from '../repositories/appRepository.js';
import * as admin from '../repositories/adminRepository.js';

const r=Router();
const sourceSchema=z.object({
  name:z.string().min(1),slug:z.string().min(1).optional(),host:z.string().min(1),port:z.coerce.number().int().positive().max(65535).default(3306),database:z.string().min(1),username:z.string().min(1),password:z.string().optional(),table:z.string().regex(/^[A-Za-z0-9_]+$/).default('fa_category'),enabled:z.boolean().optional(),priority:z.coerce.number().int().optional(),writeStats:z.boolean().optional()
});
const openListSchema=z.object({
  enabled:z.boolean().optional(),url:z.string().url().optional(),token:z.string().optional(),publicPathPrefix:z.string().min(1).optional(),apiBasePath:z.string().min(1).optional()
});
const cookieBase={httpOnly:true,sameSite:'lax',secure:env.COOKIE_SECURE,maxAge:12*60*60*1000};

r.post('/login',loginLimiter,asyncHandler(async(req,res)=>{
  const p=z.object({username:z.string().min(1),password:z.string().min(1)}).parse(req.body);
  const out=await login(p.username,p.password); const csrf=csrfToken();
  res.cookie('zonoe_admin',out.token,cookieBase); res.cookie('zonoe_csrf',csrf,{...cookieBase,httpOnly:false}); ok(res,{admin:out.admin,csrfToken:csrf});
}));
r.post('/logout',requireAdmin,requireCsrf,(req,res)=>{ res.clearCookie('zonoe_admin'); res.clearCookie('zonoe_csrf'); ok(res,{loggedOut:true}); });
r.get('/me',requireAdmin,(req,res)=>ok(res,req.admin));
r.use(requireAdmin,requireCsrf);

r.post('/account/password',asyncHandler(async(req,res)=>{
  const p=z.object({currentPassword:z.string().min(1),newPassword:z.string().min(10).max(200),confirmPassword:z.string().min(10).max(200)}).parse(req.body||{});
  if(p.newPassword!==p.confirmPassword) throw new AppError(400,'PASSWORD_CONFIRM_MISMATCH','两次输入的新密码不一致');
  await changePassword(req.admin.id,p.currentPassword,p.newPassword);
  res.clearCookie('zonoe_admin'); res.clearCookie('zonoe_csrf');
  ok(res,{changed:true,reloginRequired:true});
}));

// 应用来自外部 MySQL 软件源：这里仅提供只读聚合，不复制或上传 IPA。
r.get('/apps',asyncHandler(async(req,res)=>{ const x=await apps.listApps({...req.query,pageSize:req.query.pageSize||100}); ok(res,x.items,{page:x.page,pageSize:x.pageSize,total:x.total,sourceErrors:x.sourceErrors||[]}); }));
r.get('/apps/:id',asyncHandler(async(req,res)=>{ const x=await apps.getApp(req.params.id,false); if(!x) throw new AppError(404,'APP_NOT_FOUND','应用不存在'); x.versions=await apps.listVersions(x.id,true); ok(res,x); }));
const sourceManaged=(_req,_res,next)=>next(new AppError(405,'SOURCE_MANAGED','应用由原 MySQL 软件源管理，新站不会复制或重新上传 IPA'));
r.post('/apps',sourceManaged); r.put('/apps/:id',sourceManaged); r.delete('/apps/:id',sourceManaged);
r.post('/apps/:id/versions',sourceManaged); r.put('/versions/:id',sourceManaged); r.delete('/versions/:id',sourceManaged); r.put('/versions/:id/sources',sourceManaged);

r.get('/categories',asyncHandler(async(_req,res)=>ok(res,await admin.listCategories())));
r.get('/tags',asyncHandler(async(_req,res)=>ok(res,[])));

r.get('/sources',asyncHandler(async(_req,res)=>ok(res,await admin.listSources())));
r.post('/sources',asyncHandler(async(req,res)=>{
  const p=sourceSchema.parse(req.body||{}); if(!p.password) throw new AppError(400,'SOURCE_PASSWORD_REQUIRED','新增软件源必须填写 MySQL 密码');
  try{ ok(res,await admin.createSource(p)); }catch(e){ if(e?.code==='SOURCE_SLUG_EXISTS') throw new AppError(409,'SOURCE_SLUG_EXISTS',e.message); throw e; }
}));
r.put('/sources/:id',asyncHandler(async(req,res)=>{
  const p=sourceSchema.partial().parse(req.body||{});
  try{ const x=await admin.updateSource(Number(req.params.id),p); if(!x)throw new AppError(404,'SOURCE_NOT_FOUND','软件源不存在'); ok(res,x); }catch(e){ if(e?.code==='SOURCE_SLUG_EXISTS') throw new AppError(409,'SOURCE_SLUG_EXISTS',e.message); throw e; }
}));
r.delete('/sources/:id',asyncHandler(async(req,res)=>ok(res,{deleted:await admin.deleteSource(Number(req.params.id))})));
r.post('/sources/:id/test',asyncHandler(async(req,res)=>{
  const src=await getMysqlSource(Number(req.params.id),{withSecrets:true}); if(!src)throw new AppError(404,'SOURCE_NOT_FOUND','软件源不存在');
  try{ const connected=await testMysqlSource(src.config); ok(res,{connected}); }catch(e){ throw new AppError(400,'SOURCE_CONNECT_FAILED',`MySQL 连接失败：${e.message}`); }
}));

r.get('/openlist',asyncHandler(async(_req,res)=>ok(res,await getOpenListIpaStatus())));
r.put('/openlist',asyncHandler(async(req,res)=>{
  const p=openListSchema.parse(req.body||{});
  try { ok(res,await saveOpenListConfig(p)); }
  catch(e){ if(e?.code==='OPENLIST_TOKEN_REQUIRED') throw new AppError(400,'OPENLIST_TOKEN_REQUIRED',e.message); throw e; }
}));
r.post('/openlist/test',asyncHandler(async(_req,res)=>{
  try { ok(res,await testOpenListConnection()); }
  catch(e){ throw new AppError(502,'OPENLIST_CONNECT_FAILED',`OpenList 连接失败：${e.message}`); }
}));
r.post('/openlist/sync',asyncHandler(async(req,res)=>{
  const p=z.object({parseLimit:z.coerce.number().int().min(0).max(20).default(0)}).parse(req.body||{});
  try { ok(res,await syncOpenListIpaMetadata({parseLimit:p.parseLimit})); }
  catch(e){ throw new AppError(502,'OPENLIST_SYNC_FAILED',`OpenList 同步失败：${e.message}`); }
}));

r.get('/statistics',asyncHandler(async(_req,res)=>ok(res,await admin.statistics())));
r.get('/settings',asyncHandler(async(_req,res)=>ok(res,await admin.getSettings(false))));
r.put('/settings/:key',asyncHandler(async(req,res)=>{ const p=z.object({value:z.any(),isPublic:z.boolean().optional()}).parse(req.body); await admin.setSetting(req.params.key,p.value,p.isPublic||false); ok(res,{updated:true}); }));

r.get('/system/update',asyncHandler(async(_req,res)=>ok(res,await getOnlineUpdateStatus())));
r.post('/system/update',asyncHandler(async(req,res)=>{
  const p=z.object({channel:z.enum(['stable','preview']).default('stable')}).parse(req.body||{});
  try { const requestedBy=String(req.admin?.username||'admin'); ok(res,await queueOnlineUpdate({requestedBy,channel:p.channel})); }
  catch(e) {
    if(e?.code==='UPDATE_BUSY') throw new AppError(409,'UPDATE_BUSY',e.message);
    if(e?.code==='UPDATE_NOT_AVAILABLE') throw new AppError(409,'UPDATE_NOT_AVAILABLE',e.message);
    if(e?.code==='UPDATE_CHECK_FAILED') throw new AppError(502,'UPDATE_CHECK_FAILED',e.message);
    if(e?.code==='UPDATE_CHANNEL_INVALID') throw new AppError(400,'UPDATE_CHANNEL_INVALID',e.message);
    throw e;
  }
}));

r.post('/upload',(_req,_res,next)=>next(new AppError(405,'UPLOAD_DISABLED','此站点直接使用现有 MySQL 软件源，仅供查看，不再重复上传 IPA')));
export default r;
