import { readFileSync } from 'node:fs';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import publicRoutes from './routes/public.js';
import adminRoutes from './routes/admin.js';
import adminEnhancementRoutes from './routes/adminEnhancements.js';
import adminMetadataRoutes from './routes/adminMetadataRoutes.js';
import adminReplicaRoutes from './routes/adminReplicaRoutes.js';
import { startWriteBackScheduler } from './services/ipaWriteBackService.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { notFound,errorHandler } from './middleware/error.js';

let appVersion='unknown';
try{
  appVersion=readFileSync(new URL('../../../VERSION',import.meta.url),'utf8').trim()||'unknown';
}catch{}

export function createApp(){
  const app=express(); app.set('trust proxy',1);
  app.use(helmet({contentSecurityPolicy:false}));
  app.use(cors({origin:env.FRONTEND_ORIGIN.split(',').map(x=>x.trim()),credentials:true}));
  app.use(cookieParser()); app.use(express.json({limit:'2mb'})); app.use(express.urlencoded({extended:false})); app.use(apiLimiter);
  app.get('/healthz',(_req,res)=>res.json({ok:true,version:appVersion}));
  app.use('/api/v1',publicRoutes);
  app.use('/api/v1/admin',adminRoutes);
  app.use('/api/v1/admin',adminEnhancementRoutes);
  app.use('/api/v1/admin',adminMetadataRoutes);
  app.use('/api/v1/admin',adminReplicaRoutes);
  startWriteBackScheduler();
  app.use(notFound); app.use(errorHandler); return app;
}
