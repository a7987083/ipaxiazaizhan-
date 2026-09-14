import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin,requireCsrf } from '../middleware/auth.js';
import { asyncHandler,ok,AppError } from '../utils/http.js';
import {
  getReplicaManagerState,saveReplicaManagerConfig,previewReplicas,previewReplicaSyncPlan,syncMissingReplicas,renameReplicaSuggestion,quarantineReplicaExtras,
  getReplicaOperations,verifyReplicaOperationsNow
} from '../services/openListReplicaService.js';
import {previewReplicaRepairPlan,repairIntegrityReplicas} from '../services/replicaRepairService.js';

const r=Router();
r.use(requireAdmin,requireCsrf);

function mapError(e){
  const code=String(e?.code||'');
  if(['OPENLIST_CONFIG_REQUIRED','REPLICA_CONFIG_INVALID'].includes(code))return new AppError(400,code,e.message,e.details);
  if(['REPLICA_DISABLED','REPLICA_COPY_DISABLED','REPLICA_RENAME_DISABLED','REPLICA_QUARANTINE_DISABLED','REPLICA_REPAIR_DISABLED','REPLICA_RENAME_NOT_SUGGESTED','REPLICA_TARGET_READONLY','REPLICA_PLAN_CHANGED','REPLICA_REPAIR_PLAN_CHANGED'].includes(code))return new AppError(409,code,e.message,e.details);
  if(['OPENLIST_API_FAILED','REPLICA_SCAN_LIMIT'].includes(code))return new AppError(502,code,e.message,e.details);
  return e;
}

const mountSchema=z.object({
  storageId:z.coerce.number().int().positive(),
  mountPath:z.string().optional(),rootPath:z.string().min(1),label:z.string().max(120).optional(),enabled:z.boolean().optional(),writable:z.boolean().optional()
});
const configSchema=z.object({
  enabled:z.boolean(),allowCopy:z.boolean().optional(),allowRename:z.boolean().optional(),allowQuarantine:z.boolean().optional(),allowRepair:z.boolean().optional(),
  quarantineFolder:z.string().min(1).max(120).optional(),aliasMountPath:z.string().max(500).optional(),mounts:z.array(mountSchema).max(50)
});
const syncSchema=z.object({
  limit:z.coerce.number().int().min(1).max(50).default(20),
  targetStorageIds:z.array(z.coerce.number().int().positive()).max(50).optional().default([])
});

r.get('/openlist/replicas',asyncHandler(async(_req,res)=>{try{ok(res,await getReplicaManagerState())}catch(e){throw mapError(e)}}));
r.put('/openlist/replicas',asyncHandler(async(req,res)=>{try{ok(res,await saveReplicaManagerConfig(configSchema.parse(req.body||{})))}catch(e){throw mapError(e)}}));
r.post('/openlist/replicas/preview',asyncHandler(async(req,res)=>{
  const p=z.object({forceRefresh:z.boolean().optional().default(false),storageIds:z.array(z.coerce.number().int().positive()).max(50).optional().default([])}).parse(req.body||{});
  try{ok(res,await previewReplicas(p))}catch(e){throw mapError(e)}
}));
r.post('/openlist/replicas/sync-plan',asyncHandler(async(req,res)=>{
  const p=syncSchema.parse(req.body||{});
  try{ok(res,await previewReplicaSyncPlan(p))}catch(e){throw mapError(e)}
}));
r.post('/openlist/replicas/sync',asyncHandler(async(req,res)=>{
  const p=syncSchema.extend({planHash:z.string().regex(/^[a-f0-9]{64}$/i).optional().default('')}).parse(req.body||{});
  try{ok(res,await syncMissingReplicas(p))}catch(e){throw mapError(e)}
}));
r.post('/openlist/replicas/repair-plan',asyncHandler(async(req,res)=>{
  const p=syncSchema.parse(req.body||{});
  try{ok(res,await previewReplicaRepairPlan(p))}catch(e){throw mapError(e)}
}));
r.post('/openlist/replicas/repair',asyncHandler(async(req,res)=>{
  const p=syncSchema.extend({planHash:z.string().regex(/^[a-f0-9]{64}$/i)}).parse(req.body||{});
  try{ok(res,await repairIntegrityReplicas(p))}catch(e){throw mapError(e)}
}));
r.get('/openlist/replicas/operations',asyncHandler(async(req,res)=>{
  const p=z.object({limit:z.coerce.number().int().min(1).max(200).default(100)}).parse(req.query||{});
  try{ok(res,await getReplicaOperations(p))}catch(e){throw mapError(e)}
}));
r.post('/openlist/replicas/operations/verify',asyncHandler(async(req,res)=>{
  const p=z.object({limit:z.coerce.number().int().min(1).max(100).default(100)}).parse(req.body||{});
  try{ok(res,await verifyReplicaOperationsNow(p))}catch(e){throw mapError(e)}
}));
r.post('/openlist/replicas/rename',asyncHandler(async(req,res)=>{
  const p=z.object({storageId:z.coerce.number().int().positive(),fromRelative:z.string().min(1).max(2000),toRelative:z.string().min(1).max(2000)}).parse(req.body||{});
  try{ok(res,await renameReplicaSuggestion(p))}catch(e){throw mapError(e)}
}));
r.post('/openlist/replicas/quarantine',asyncHandler(async(req,res)=>{
  const p=z.object({items:z.array(z.object({storageId:z.coerce.number().int().positive(),relativePath:z.string().min(1).max(2000)})).min(1).max(50)}).parse(req.body||{});
  try{ok(res,await quarantineReplicaExtras(p))}catch(e){throw mapError(e)}
}));

export default r;
