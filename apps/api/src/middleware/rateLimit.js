import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';
export const apiLimiter = rateLimit({windowMs:60_000, limit:600, standardHeaders:true, legacyHeaders:false});
export const loginLimiter = rateLimit({windowMs:15*60_000, limit:20, standardHeaders:true, legacyHeaders:false});
export const downloadLimiter = rateLimit({windowMs:60_000, limit:env.DOWNLOAD_RATE_LIMIT, standardHeaders:true, legacyHeaders:false});
