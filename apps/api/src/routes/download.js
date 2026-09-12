import { Router } from 'express';
import { asyncHandler } from '../utils/http.js';
import { resolveDownload } from '../services/downloadService.js';
import { downloadLimiter } from '../middleware/rateLimit.js';
const r=Router();
r.get('/:appId',downloadLimiter,asyncHandler(async(req,res)=>{
  const out=await resolveDownload({appId:Number(req.params.appId),versionId:req.query.versionId?Number(req.query.versionId):undefined,ip:req.ip,userAgent:req.get('user-agent'),referer:req.get('referer')});
  res.set('Cache-Control','no-store');
  res.redirect(302,out.url);
}));
export default r;
