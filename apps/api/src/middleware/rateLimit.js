import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';
const jsonHandler=(code,message)=>(_req,res)=>res.status(429).json({ok:false,error:{code,message}});
export const apiLimiter = rateLimit({windowMs:60_000, limit:600, standardHeaders:true, legacyHeaders:false,handler:jsonHandler('RATE_LIMITED','请求过于频繁，请稍后再试')});
export const loginLimiter = rateLimit({windowMs:15*60_000, limit:20, standardHeaders:true, legacyHeaders:false,handler:jsonHandler('LOGIN_RATE_LIMITED','登录尝试过多，请稍后再试')});
export const downloadLimiter = rateLimit({windowMs:60_000, limit:env.DOWNLOAD_RATE_LIMIT, standardHeaders:true, legacyHeaders:false,handler:jsonHandler('DOWNLOAD_RATE_LIMITED','下载请求过于频繁，请稍后再试')});
