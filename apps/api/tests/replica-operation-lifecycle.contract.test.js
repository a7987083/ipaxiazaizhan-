import {describe,expect,test} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {COPY_MISMATCH_CONFIRM_MS,COPY_VERIFY_TIMEOUT_MS,evaluateReplicaCopyVerification} from '../src/services/openListReplicaService.js';
import {summarizeReplicaOperationState} from '../src/services/replicaOperationStore.js';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const started='2026-09-15T00:00:00.000Z';
const base={submittedAt:started,createdAt:started,expectedMd5:'A'.repeat(32),expectedSize:1024};
const t=ms=>Date.parse(started)+ms;

describe('replica copy lifecycle and audit',()=>{
  test('copy verification prefers MD5 and records a verified success',()=>{
    expect(evaluateReplicaCopyVerification(base,{md5:'A'.repeat(32),size:1024},t(5_000))).toMatchObject({status:'success',verification:'md5'});
  });

  test('mismatch is given a short consistency window before terminal failure',()=>{
    expect(evaluateReplicaCopyVerification(base,{md5:'B'.repeat(32),size:1024},t(COPY_MISMATCH_CONFIRM_MS-1))).toMatchObject({status:'verifying',verification:'md5_mismatch_pending'});
    expect(evaluateReplicaCopyVerification(base,{md5:'B'.repeat(32),size:1024},t(COPY_MISMATCH_CONFIRM_MS+1))).toMatchObject({status:'failed',verification:'md5_mismatch'});
  });

  test('missing target waits and then times out',()=>{
    expect(evaluateReplicaCopyVerification(base,null,t(10_000)).status).toBe('waiting');
    expect(evaluateReplicaCopyVerification(base,null,t(COPY_VERIFY_TIMEOUT_MS+1))).toMatchObject({status:'timeout',verification:'not_found'});
  });

  test('provider without target hash is explicitly downgraded to size-only verification',()=>{
    expect(evaluateReplicaCopyVerification(base,{md5:'',size:1024},t(20_000))).toMatchObject({status:'success',verification:'size_only_no_hash'});
  });

  test('operation summary distinguishes active/success/failure/timeout',()=>{
    const summary=summarizeReplicaOperationState({batches:[{id:'b1',status:'running'}],operations:[
      {id:'1',batchId:'b1',status:'submitted'},{id:'2',batchId:'b1',status:'waiting'},{id:'3',batchId:'b1',status:'success'},
      {id:'4',batchId:'b1',status:'failed'},{id:'5',batchId:'b1',status:'timeout'}
    ]});
    expect(summary).toMatchObject({total:5,active:2,success:1,failed:1,timeout:1,batchesActive:1});
  });

  test('failed-only copy batch does not schedule target refresh',()=>{
    const store=read('apps/api/src/services/replicaOperationStore.js');
    expect(store).toContain("const submitted=operations.filter(x=>x.status==='submitted')");
    expect(store).toContain('targetStorageIds:submitted.map(x=>x.targetStorageId)');
    expect(store).toContain('x.targetStorageIds.length>0');
    expect(store).toContain("status:submitted.length?'submitted':'failed'");
  });

  test('copy lifecycle is persisted, restart-resumable and target-scoped',()=>{
    const store=read('apps/api/src/services/replicaOperationStore.js');
    const service=read('apps/api/src/services/openListReplicaService.js');
    const server=read('apps/api/src/server.js');
    expect(store).toContain('openlist-replica-operations.json');
    expect(store).toContain('mode:0o600');
    expect(store).toContain('getPendingReplicaCopyOperations');
    expect(service).toContain("'/api/fs/get'");
    expect(service).toContain("'/api/fs/list'");
    expect(service).toContain('scope_changed');
    expect(service).toContain('previewReplicas({forceRefresh:true,storageIds})');
    expect(service).toContain('trackingBatchId');
    expect(server).toContain('startReplicaOperationVerifier');
    expect(server).toContain('stopReplicaOperationVerifier');
  });

  test('admin exposes task status, manual verification and audit UI',()=>{
    const routes=read('apps/api/src/routes/adminReplicaRoutes.js');
    const ui=read('apps/web/src/pages/AdminReplicaOperationsPanel.jsx');
    expect(routes).toContain("'/openlist/replicas/operations'");
    expect(routes).toContain("'/openlist/replicas/operations/verify'");
    expect(ui).toContain('复制任务与操作审计');
    expect(ui).toContain('立即核验复制任务');
    expect(ui).toContain('最近复制批次');
    expect(ui).toContain('最近操作审计');
    expect(ui).toContain('MD5 一致');
  });
});
