import {describe,expect,test} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {summarizeRangeUsage} from '../src/services/rangeUsageService.js';
import {snapshotFresh,REPLICA_SNAPSHOT_TTL_MS} from '../src/services/replicaSnapshotStore.js';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

describe('OpenList API scheduling and cache contract',()=>{
  test('directory listing uses one-page per_page=0 with refresh=false',()=>{
    const metadata=read('apps/api/src/services/openListMetadataService.js');
    const replica=read('apps/api/src/services/openListReplicaService.js');
    expect(metadata).toContain("per_page:0,refresh:false");
    expect(replica).toContain("per_page:0,refresh:false");
    expect(metadata).not.toContain('const PAGE_SIZE = 500');
    expect(replica).not.toContain('const PAGE_SIZE=500');
  });

  test('replica scans have persistent 30 minute snapshots and targeted invalidation',()=>{
    expect(REPLICA_SNAPSHOT_TTL_MS).toBe(30*60*1000);
    expect(snapshotFresh({scannedAt:new Date(Date.now()-60_000).toISOString()})).toBe(true);
    const service=read('apps/api/src/services/openListReplicaService.js');
    expect(service).toContain('readReplicaSnapshots');
    expect(service).toContain('invalidateReplicaSnapshots');
    expect(service).toContain('storageIds=[]');
    expect(service).toContain('targetSnapshotsInvalidated');
    expect(service).toContain('seenDirs=new Set()');
  });

  test('sync no longer begins with an unconditional full preview',()=>{
    const service=read('apps/api/src/services/openListReplicaService.js');
    const sync=service.slice(service.indexOf('export async function syncMissingReplicas'),service.indexOf('export async function renameReplicaSuggestion'));
    expect(sync).toContain('currentPreview()');
    expect(sync).not.toContain('const preview=await previewReplicas()');
  });

  test('Range usage is telemetry-only and no longer exposes hourly/daily quota fields',()=>{
    const now=Date.now();
    const events=Array.from({length:11},(_,i)=>({at:new Date(now-i*1000).toISOString(),success:true,rangeBytes:100,rangeRequests:2}));
    const s=summarizeRangeUsage(events,now);
    expect(s.hour.attempts).toBe(11);
    expect(s.hour.rangeRequests).toBe(22);
    expect(s.day.attempts).toBe(11);
    expect(s).not.toHaveProperty('limits');
    expect(s.hour).not.toHaveProperty('remaining');
    expect(s.day).not.toHaveProperty('remaining');
  });

  test('Range request count/bytes and MD5 reuse are wired into core sync without global quota gating',()=>{
    const parser=read('scripts/ipa-range-info.py');
    const service=read('apps/api/src/services/openListMetadataService.js');
    expect(parser).toContain("'range_requests': remote.requests");
    expect(service).toContain('appendRangeUsage');
    expect(service).toContain('getRangeUsageStatus');
    expect(service).toContain('getParsedMetadataByMd5');
    expect(service).toContain('rememberParsedMetadata');
    expect(service).toContain('metadataReusedByMd5');
    expect(service).not.toContain('budgetAllowed');
    expect(service).not.toContain('budgetBlocked');
    expect(service).not.toContain('getRangeBudgetStatus');
  });

  test('background metadata reconciliation is no longer a 1 second loop',()=>{
    const service=read('apps/api/src/services/ipaMetadataPersistenceService.js');
    expect(service).toContain('30_000');
    expect(service).not.toContain('1000);');
  });

  test('admin UI shows plain Range totals, configurable schedule and no quota copy',()=>{
    const replica=read('apps/web/src/pages/AdminReplicaPanel.jsx');
    const metadata=read('apps/web/src/pages/AdminOpenListPanel.jsx');
    expect(replica).toContain('只刷新这个盘');
    expect(replica).toContain('快照命中 / 实扫');
    expect(replica).toContain('预览补齐此盘（20 个）');
    expect(replica).toContain('补齐计划预览');
    expect(metadata).toContain('Range Parser 用量');
    expect(metadata).toContain('function TextCard');
    expect(metadata).toContain('<TextCard t="本小时" v={Number(hour.attempts||0).toLocaleString()}/>');
    expect(metadata).toContain('<TextCard t="今日" v={Number(day.attempts||0).toLocaleString()}/>');
    expect(metadata).toContain('min="5" max="1440"');
    expect(metadata).toContain('min="1" max="20"');
    expect(metadata).toContain('后台扫描 MD5（使用缓存）');
    expect(metadata).toContain('后台解析 1 个');
    expect(metadata).not.toContain('/10');
    expect(metadata).not.toContain('/150');
    expect(metadata).not.toContain('剩余额度');
    expect(metadata).not.toContain('预算拦截');
    expect(metadata).not.toContain('budgetExhausted');
  });

  test('desktop admin sidebar stays visible while page scrolls and mobile bottom nav stays fixed',()=>{
    const css=read('apps/web/src/styles.css');
    expect(css).toContain('.admin-shell aside{position:sticky;top:0;align-self:start;height:100vh;overflow-y:auto');
    expect(css).toContain('.admin-shell aside{position:fixed;top:auto;bottom:0;left:0;right:0;z-index:60;height:auto;overflow-y:visible;align-self:auto');
  });
});
