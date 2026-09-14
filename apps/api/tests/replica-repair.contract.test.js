import {describe,expect,test} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildReplicaRepairPlan} from '../src/services/replicaRepairService.js';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const replica={allowRepair:true,allowCopy:true,allowQuarantine:true,quarantineFolder:'.zonoe-quarantine',mounts:[
  {storageId:1,label:'天翼',mountPath:'/tianyi',rootPath:'/tianyi/app',enabled:true,writable:true},
  {storageId:2,label:'阿里',mountPath:'/ali',rootPath:'/ali/app',enabled:true,writable:true},
  {storageId:3,label:'123',mountPath:'/123',rootPath:'/123/app',enabled:true,writable:true}
]};
function mount(storageId,integrityIssues=[]){const base=replica.mounts.find(x=>x.storageId===storageId);return {...base,error:null,integrityIssues,renameSuggestions:[]};}

describe('controlled replica mismatch remediation',()=>{
  test('repair plan uses only a verified source for a mismatch target',()=>{
    const preview={generatedAt:'2026-09-15T00:00:00Z',mounts:[
      mount(1),mount(2),mount(3,[{relativePath:'Bad.ipa',status:'md5_mismatch',actualMd5:'B'.repeat(32),actualSize:100}])
    ],rows:[{relativePath:'Bad.ipa',md5:'A'.repeat(32),size:100,copies:{1:true,2:true,3:true},copyStatus:{1:'unverified',2:'verified',3:'md5_mismatch'}}]};
    const plan=buildReplicaRepairPlan(preview,replica,{targetStorageIds:[3]});
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0]).toMatchObject({sourceStorageId:2,sourceStatus:'verified',targetStorageId:3,targetStatus:'md5_mismatch',expectedMd5:'A'.repeat(32),targetActualMd5:'B'.repeat(32)});
    expect(plan.summary.md5Mismatches).toBe(1);
  });

  test('mismatch is not auto-repaired without a verified source',()=>{
    const preview={generatedAt:'2026-09-15T00:00:00Z',mounts:[mount(1),mount(2),mount(3,[{relativePath:'NoSource.ipa',status:'size_mismatch',actualSize:101}])],rows:[
      {relativePath:'NoSource.ipa',md5:'A'.repeat(32),size:100,copies:{1:true,2:true,3:true},copyStatus:{1:'unverified',2:'unverified',3:'size_mismatch'}}
    ]};
    const plan=buildReplicaRepairPlan(preview,replica,{targetStorageIds:[3]});
    expect(plan.actions).toHaveLength(0);
    expect(plan.summary.skippedNoVerifiedSource).toBe(1);
  });

  test('repair hash changes when observed bad target content changes',()=>{
    const row={relativePath:'Hash.ipa',md5:'A'.repeat(32),size:100,copies:{1:true,2:true,3:true},copyStatus:{1:'verified',2:'verified',3:'md5_mismatch'}};
    const make=actualMd5=>({generatedAt:'2026-09-15T00:00:00Z',mounts:[mount(1),mount(2),mount(3,[{relativePath:'Hash.ipa',status:'md5_mismatch',actualMd5,actualSize:100}])],rows:[row]});
    const a=buildReplicaRepairPlan(make('B'.repeat(32)),replica,{targetStorageIds:[3]});
    const b=buildReplicaRepairPlan(make('C'.repeat(32)),replica,{targetStorageIds:[3]});
    expect(a.planHash).toMatch(/^[a-f0-9]{64}$/);
    expect(a.planHash).not.toBe(b.planHash);
  });

  test('repair execution is quarantine-first, live-rechecked and never permanently deletes',()=>{
    const service=read('apps/api/src/services/replicaRepairService.js');
    const move=service.indexOf("type:'repair_quarantine'");
    const refill=service.indexOf("type:'repair_refill'");
    expect(service).toContain("replicaIntegrityStatus(expected,sourceActual)!=='verified'");
    expect(service).toContain("['md5_mismatch','size_mismatch'].includes(liveTargetStatus)");
    expect(service).toContain("'/api/fs/rename'");
    expect(service).toContain("'/api/fs/move'");
    expect(service).toContain("'/api/fs/copy'");
    expect(service.indexOf("'/api/fs/rename'")).toBeLessThan(service.indexOf("'/api/fs/copy'"));
    expect(move).toBeGreaterThan(-1);
    expect(refill).toBeGreaterThan(move);
    expect(service).toContain('permanentDelete:false');
    expect(service).not.toContain("'/api/fs/remove'");
  });

  test('repair quarantine uses synchronous rename before async move/copy and prefers the storage mount root',()=>{
    const service=read('apps/api/src/services/replicaRepairService.js');
    expect(service).toContain('const quarantineBase=cleanPath(target.mountPath||a.targetMountPath||target.rootPath)');
    expect(service).toContain("replica.quarantineFolder,'repair'");
    expect(service).toContain('Current OpenList /api/fs/move returns after scheduling an async task');
    expect(service).toContain('refresh:true');
    expect(service).toContain('repair_quarantine_move');
    expect(service).toContain('.quarantine`');
  });

  test('admin requires explicit repair permission and exposes preview-before-execute flow',()=>{
    const control=read('apps/api/src/storage/controlStore.js');
    const routes=read('apps/api/src/routes/adminReplicaRoutes.js');
    const ui=read('apps/web/src/pages/AdminReplicaRepairPanel.jsx');
    expect(control).toContain('allowRepair:input?.allowRepair===true');
    expect(routes).toContain("'/openlist/replicas/repair-plan'");
    expect(routes).toContain("'/openlist/replicas/repair'");
    expect(ui).toContain('允许异常副本修复');
    expect(ui).toContain('异常副本修复计划');
    expect(ui).toContain('确认隔离并补回');
    expect(ui).toContain('不会永久删除');
  });
});
