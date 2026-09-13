import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin,requireCsrf } from '../middleware/auth.js';
import { asyncHandler,ok } from '../utils/http.js';
import { listAdminOpenListParseResults } from '../services/adminIpaMetadataService.js';

const r=Router();
r.use(requireAdmin,requireCsrf);

r.get('/openlist/results-rich',asyncHandler(async(req,res)=>{
  const p=z.object({
    page:z.coerce.number().int().min(1).default(1),
    pageSize:z.coerce.number().int().min(1).max(100).default(50),
    q:z.string().optional().default(''),
    status:z.enum(['all','parsed','pending','failed','mismatch']).default('all')
  }).parse(req.query||{});
  const x=await listAdminOpenListParseResults(p);
  ok(res,x.items,{total:x.total,page:x.page,pageSize:x.pageSize,counts:x.counts,requiresRescan:x.requiresRescan});
}));

export default r;
