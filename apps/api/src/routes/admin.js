import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { asyncHandler,ok,AppError } from '../utils/http.js';
import { csrfToken } from '../utils/crypto.js';
import { login,changePassword } from '../services/authService.js';
import { getOnlineUpdateStatus,queueOnlineUpdate } from '../services/updateService.js';
import { getOpenListIpaStatus,queueOpenListIpaMetadata,testOpenListConnection,listMissingOpenListEntries,listOpenListParseResults,resetOpenListScheduler } from '../services/openListMetadataService.js';
import { testMysqlSource } from '../services/mysqlCli.js';
import { applyIpaWriteback,listSourceColumns,listWritebackHistory,previewIpaWriteback,saveSourceIpaSync } from '../services/ipaWritebackService.js';
import { clearLocalCache,getLocalCacheStatus,getMysqlSource,saveOpenListConfig,saveOpenListSchedule,setSettings } from '../storage/controlStore.js';
import { loginLimiter } from '../middleware/rateLimit.js';
import { requireAdmin,requireCsrf } from '../middleware/auth.js';
import * as apps from '../repositories/appRepository.js';
import * as admin from '../repositories/adminRepository.js';

const r=Router();
const sourceSchema=z.object({
  name:z.string().min(1),slug:z.string().min(1).optional(),host:z.string().min(1),port:z.coerce.number().int().positive().max(65535).default(3306),database:z.string().min(1),username:z.string().min(1),password:z.string().optional(),table:z.string().regex(/^[A-Za-z0-9_]+$/).default('fa_category'),enabled:z.boolean().optional(),priority:z.coerce.number().int().optional(),writeStats:z.boolean().optional()
});
const ipaSyncSchema=z.object({
  mode:z.enum(['disabled','preview','auto_update']).default('disabled'),
  mappings:z.record(z.string(),z.object({enabled:z.boolean().optional().default(false),column:z.string().max(128).optional().default(''),strategy:z.enum(['always','if_empty','if_changed','preview']).optional().default('if_changed')})).optional().default({})
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

// 应用来自外部 MySQL 软件源。常规管理仍只读；只有显式配置的 IPA 字段映射允许写回已有记录。
r.get('/apps',asyncHandler(async(req,res)=>{ const x=await apps.listApps({...req.query,pageSize:req.query.pageSize||100}); ok(res,x.items,{page:x.page,pageSize:x.pageSize,total:x.total,sourceErrors:x.sourceErrors||[]}); }));
r.get('/apps/:id',asyncHandler(async(req,res)=>{ const x=await apps.getApp(req.params.id,false); if(!x) throw new AppError(404,'APP_NOT_FOUND','应用不存在'); x.versions=await apps.listVersions(x.id,true); ok(res,x); }));
const sourceManaged=(_req,_res,next)=>next(new AppError(405,'SOURCE_MANAGED','应用由原 MySQL 软件源管理；仅 IPA 字段映射功能可以按授权字段更新已有记录'));
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
r.get('/sources/:id/columns',asyncHandler(async(req,res)=>{
  try{ ok(res,await listSourceColumns(Number(req.params.id))); }
  catch(e){ throw new AppError(e?.status||400,e?.code||'SOURCE_COLUMNS_FAILED',e.message); }
}));
r.put('/sources/:id/ipa-sync',asyncHandler(async(req,res)=>{
  const p=ipaSyncSchema.parse(req.body||{});
  try{ ok(res,await saveSourceIpaSync(Number(req.params.id),p)); }
  catch(e){ throw new AppError(e?.status||400,e?.code||'IPA_SYNC_CONFIG_FAILED',e.message); }
}));
r.post('/sources/:id/ipa-sync/preview',asyncHandler(async(req,res)=>{
  const p=z.object({limit:z.coerce.number().int().min(1).max(500).default(100),appKeys:z.array(z.string()).max(500).optional().default([])}).parse(req.body||{});
  try{ ok(res,await previewIpaWriteback({sourceId:Number(req.params.id),...p})); }
  catch(e){ throw new AppError(e?.status||400,e?.code||'IPA_SYNC_PREVIEW_FAILED',e.message); }
}));
r.post('/sources/:id/ipa-sync/apply',asyncHandler(async(req,res)=>{
  const p=z.object({limit:z.coerce.number().int().min(1).max(500).default(50),appKeys:z.array(z.string()).max(500).optional().default([])}).parse(req.body||{});
  try{ ok(res,await applyIpaWriteback({sourceId:Number(req.params.id),...p,trigger:`manual:${req.admin?.username||'admin'}`})); }
  catch(e){ throw new AppError(e?.status||400,e?.code||'IPA_SYNC_APPLY_FAILED',e.message); }
}));
r.get('/writeback/history',asyncHandler(async(req,res)=>{
  const p=z.object({limit:z.coerce.number().int().min(1).max(500).default(100)}).parse(req.query||{});
  ok(res,await listWritebackHistory(p.limit));
}));

r.get('/openlist',asyncHandler(async(_req,res)=>ok(res,await getOpenListIpaStatus())));
r.put('/openlist',asyncHandler(async(req,res)=>{
  const p=openListSchema.parse(req.body||{});
  try { ok(res,await saveOpenListConfig(p)); }
  catch(e){ if(e?.code==='OPENLIST_TOKEN_REQUIRED') throw new AppError(400,'OPENLIST_TOKEN_REQUIRED',e.message); throw e; }
}));
r.put('/openlist/schedule',asyncHandler(async(req,res)=>{
  const p=z.object({enabled:z.boolean(),intervalMinutes:z.coerce.number().int().min(5).max(1440),parseLimit:z.coerce.number().int().min(1).max(20)}).parse(req.body||{});
  try { const out=await saveOpenListSchedule(p); resetOpenListScheduler(); ok(res,out.schedule); }
  catch(e){ if(e?.code==='OPENLIST_CONFIG_REQUIRED') throw new AppError(400,'OPENLIST_CONFIG_REQUIRED',e.message); throw e; }
}));
r.get('/openlist/missing',asyncHandler(async(req,res)=>{
  const p=z.object({page:z.coerce.number().int().min(1).default(1),pageSize:z.coerce.number().int().min(1).max(200).default(100),q:z.string().optional().default('')}).parse(req.query||{});
  const x=await listMissingOpenListEntries(p); ok(res,x.items,{total:x.total,page:x.page,pageSize:x.pageSize,uniqueMissingFiles:x.uniqueMissingFiles});
}));
r.get('/openlist/results',asyncHandler(async(req,res)=>{
  const p=z.object({
    page:z.coerce.number().int().min(1).default(1),
    pageSize:z.coerce.number().int().min(1).max(100).default(50),
    q:z.string().optional().default(''),
    status:z.enum(['all','parsed','pending','failed','mismatch']).default('all')
  }).parse(req.query||{});
  const x=await listOpenListParseResults(p);
  ok(res,x.items,{total:x.total,page:x.page,pageSize:x.pageSize,counts:x.counts,requiresRescan:x.requiresRescan});
}));
r.post('/openlist/test',asyncHandler(async(_req,res)=>{
  try { ok(res,await testOpenListConnection()); }
  catch(e){ throw new AppError(502,'OPENLIST_CONNECT_FAILED',`OpenList 连接失败：${e.message}`); }
}));
r.post('/openlist/sync',asyncHandler(async(req,res)=>{
  const p=z.object({parseLimit:z.coerce.number().int().min(0).max(20).default(0),forceListRefresh:z.boolean().optional().default(false)}).parse(req.body||{});
  try { ok(res,await queueOpenListIpaMetadata({parseLimit:p.parseLimit,forceListRefresh:p.forceListRefresh,trigger:'manual'})); }
  catch(e){
    if(e?.code==='OPENLIST_TASK_BUSY') throw new AppError(409,'OPENLIST_TASK_BUSY',e.message);
    if(e?.code==='OPENLIST_CONFIG_REQUIRED') throw new AppError(400,'OPENLIST_CONFIG_REQUIRED',e.message);
    if(e?.code==='OPENLIST_DISABLED') throw new AppError(409,'OPENLIST_DISABLED',e.message);
    throw new AppError(502,'OPENLIST_SYNC_FAILED',`OpenList 同步失败：${e.message}`);
  }
}));

r.get('/cache',asyncHandler(async(_req,res)=>ok(res,await getLocalCacheStatus())));
r.post('/cache/clear',asyncHandler(async(req,res)=>{
  const p=z.object({scope:z.enum(['directory','ipa','failed','task','all'])}).parse(req.body||{});
  try{ ok(res,await clearLocalCache(p.scope)); }
  catch(e){ throw new AppError(400,e?.code||'CACHE_CLEAR_FAILED',e.message); }
}));

r.get('/statistics',asyncHandler(async(_req,res)=>ok(res,await admin.statistics())));
r.get('/settings',asyncHandler(async(_req,res)=>ok(res,await admin.getSettings(false))));
r.put('/settings',asyncHandler(async(req,res)=>{
  const p=z.object({values:z.record(z.string(),z.any())}).parse(req.body||{});
  ok(res,await setSettings(p.values));
}));
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

r.post('/upload',(_req,_res,next)=>next(new AppError(405,'UPLOAD_DISABLED','此站点继续复用现有 IPA；自动写回仅更新已存在的软件源记录，不会自动创建 App')));
export default r;
