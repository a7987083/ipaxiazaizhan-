import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { z } from 'zod';
import { env } from '../config/env.js';
import { asyncHandler,ok,AppError } from '../utils/http.js';
import { csrfToken,encryptJson } from '../utils/crypto.js';
import { login } from '../services/authService.js';
import { loginLimiter } from '../middleware/rateLimit.js';
import { requireAdmin,requireCsrf } from '../middleware/auth.js';
import * as apps from '../repositories/appRepository.js';
import * as admin from '../repositories/adminRepository.js';

const r=Router();
const appSchema=z.object({name:z.string().min(1),slug:z.string().min(1),bundleId:z.string().min(2),iconUrl:z.string().optional().nullable(),shortDescription:z.string().optional().nullable(),description:z.string().optional().nullable(),developer:z.string().optional().nullable(),categoryId:z.coerce.number().optional().nullable(),status:z.enum(['draft','published','unlisted']).optional(),featured:z.boolean().optional(),hot:z.boolean().optional(),sortOrder:z.coerce.number().int().optional(),tagIds:z.array(z.coerce.number()).optional(),screenshots:z.array(z.string()).optional()});
const versionSchema=z.object({version:z.string().min(1),build:z.string().optional(),fileSize:z.coerce.number().int().nonnegative().optional().nullable(),minIos:z.string().optional().nullable(),changelog:z.string().optional().nullable(),status:z.enum(['draft','published','disabled']).optional(),releaseDate:z.string().optional().nullable(),setCurrent:z.boolean().optional(),sources:z.array(z.object({sourceId:z.coerce.number(),target:z.string().min(1),priority:z.coerce.number().int().optional(),enabled:z.boolean().optional(),meta:z.record(z.string(),z.any()).optional()})).optional()});

r.post('/login',loginLimiter,asyncHandler(async(req,res)=>{ const p=z.object({username:z.string().min(1),password:z.string().min(1)}).parse(req.body); const out=await login(p.username,p.password); const csrf=csrfToken(); const base={httpOnly:true,sameSite:'lax',secure:env.COOKIE_SECURE,maxAge:12*60*60*1000}; res.cookie('zonoe_admin',out.token,base); res.cookie('zonoe_csrf',csrf,{...base,httpOnly:false}); ok(res,{admin:out.admin,csrfToken:csrf}); }));
r.post('/logout',requireAdmin,requireCsrf,(req,res)=>{ res.clearCookie('zonoe_admin'); res.clearCookie('zonoe_csrf'); ok(res,{loggedOut:true}); });
r.get('/me',requireAdmin,(req,res)=>ok(res,req.admin));
r.use(requireAdmin,requireCsrf);

r.get('/apps',asyncHandler(async(req,res)=>{ const x=await apps.listApps({...req.query,status:req.query.status||null}); ok(res,x.items,{page:x.page,pageSize:x.pageSize,total:x.total}); }));
r.get('/apps/:id',asyncHandler(async(req,res)=>{ const x=await apps.getApp(req.params.id,false); if(!x) throw new AppError(404,'APP_NOT_FOUND','应用不存在'); x.versions=await apps.listVersions(x.id,true); ok(res,x); }));
r.post('/apps',asyncHandler(async(req,res)=>ok(res,await apps.createApp(appSchema.parse(req.body)))));
r.put('/apps/:id',asyncHandler(async(req,res)=>{ const x=await apps.updateApp(Number(req.params.id),appSchema.partial().parse(req.body)); if(!x) throw new AppError(404,'APP_NOT_FOUND','应用不存在'); ok(res,x); }));
r.delete('/apps/:id',asyncHandler(async(req,res)=>{ if(!(await apps.deleteApp(Number(req.params.id)))) throw new AppError(404,'APP_NOT_FOUND','应用不存在'); ok(res,{deleted:true}); }));
r.post('/apps/:id/versions',asyncHandler(async(req,res)=>ok(res,await apps.createVersion(Number(req.params.id),versionSchema.parse(req.body)))));
r.put('/versions/:id',asyncHandler(async(req,res)=>{ const x=await apps.updateVersion(Number(req.params.id),versionSchema.partial().omit({sources:true,setCurrent:true}).parse(req.body)); if(!x) throw new AppError(404,'VERSION_NOT_FOUND','版本不存在'); ok(res,x); }));
r.delete('/versions/:id',asyncHandler(async(req,res)=>{ if(!(await apps.deleteVersion(Number(req.params.id)))) throw new AppError(404,'VERSION_NOT_FOUND','版本不存在'); ok(res,{deleted:true}); }));
r.put('/versions/:id/sources',asyncHandler(async(req,res)=>{ const p=z.object({sources:versionSchema.shape.sources.unwrap()}).parse(req.body); await apps.replaceVersionSources(Number(req.params.id),p.sources); ok(res,{updated:true}); }));
r.get('/versions/:id/sources',asyncHandler(async(req,res)=>ok(res,await apps.getVersionSources(Number(req.params.id)))));

r.get('/categories',asyncHandler(async(_req,res)=>ok(res,await admin.listCategories())));
r.post('/categories',asyncHandler(async(req,res)=>ok(res,await admin.createCategory(z.object({name:z.string(),slug:z.string(),sortOrder:z.coerce.number().optional(),enabled:z.boolean().optional()}).parse(req.body)))));
r.put('/categories/:id',asyncHandler(async(req,res)=>ok(res,await admin.updateCategory(Number(req.params.id),req.body))));
r.delete('/categories/:id',asyncHandler(async(req,res)=>ok(res,{deleted:await admin.deleteCategory(Number(req.params.id))})));
r.get('/tags',asyncHandler(async(_req,res)=>ok(res,await admin.listTags())));
r.post('/tags',asyncHandler(async(req,res)=>ok(res,await admin.createTag(z.object({name:z.string(),slug:z.string()}).parse(req.body)))));
r.delete('/tags/:id',asyncHandler(async(req,res)=>ok(res,{deleted:await admin.deleteTag(Number(req.params.id))})));

r.get('/sources',asyncHandler(async(_req,res)=>ok(res,await admin.listSources())));
r.post('/sources',asyncHandler(async(req,res)=>{ const p=z.object({name:z.string(),type:z.enum(['local','http','openlist','cloud','cdn','s3','oss','r2','other']),baseUrl:z.string().optional().nullable(),config:z.record(z.string(),z.any()).optional(),enabled:z.boolean().optional(),priority:z.coerce.number().optional()}).parse(req.body); ok(res,await admin.createSource({...p,configEncrypted:p.config?encryptJson(p.config):null})); }));
r.put('/sources/:id',asyncHandler(async(req,res)=>{ const p=req.body||{}; if(p.config) p.configEncrypted=encryptJson(p.config); delete p.config; ok(res,await admin.updateSource(Number(req.params.id),p)); }));
r.delete('/sources/:id',asyncHandler(async(req,res)=>ok(res,{deleted:await admin.deleteSource(Number(req.params.id))})));

r.get('/statistics',asyncHandler(async(_req,res)=>ok(res,await admin.statistics())));
r.get('/settings',asyncHandler(async(_req,res)=>ok(res,await admin.getSettings(false))));
r.put('/settings/:key',asyncHandler(async(req,res)=>{ const p=z.object({value:z.any(),isPublic:z.boolean().optional()}).parse(req.body); await admin.setSetting(req.params.key,p.value,p.isPublic||false); ok(res,{updated:true}); }));

await fs.mkdir(env.LOCAL_STORAGE_DIR,{recursive:true});
const upload=multer({dest:env.LOCAL_STORAGE_DIR,limits:{fileSize:env.MAX_UPLOAD_MB*1024*1024}});
r.post('/upload',upload.single('file'),asyncHandler(async(req,res)=>{
  if(!req.file) throw new AppError(400,'FILE_REQUIRED','请选择 IPA 文件');
  const original=req.file.originalname||''; if(!original.toLowerCase().endsWith('.ipa')) { await fs.unlink(req.file.path); throw new AppError(400,'INVALID_FILE','只允许上传 .ipa 文件'); }
  const fd=await fs.open(req.file.path,'r'); const sig=Buffer.alloc(4); await fd.read(sig,0,4,0); await fd.close();
  if(!(sig[0]===0x50&&sig[1]===0x4b)) { await fs.unlink(req.file.path); throw new AppError(400,'INVALID_IPA','IPA 必须是有效 ZIP 容器'); }
  const final=`${Date.now()}-${crypto.randomBytes(8).toString('hex')}.ipa`; await fs.rename(req.file.path,path.join(env.LOCAL_STORAGE_DIR,final)); ok(res,{target:final,size:req.file.size,originalName:original});
}));
export default r;
