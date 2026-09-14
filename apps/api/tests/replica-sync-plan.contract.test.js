import {describe,expect,test} from 'vitest';
import {buildReplicaSyncPlan} from '../src/services/openListReplicaService.js';

const replica={mounts:[
  {storageId:1,label:'天翼',mountPath:'/tianyi',rootPath:'/tianyi/app',enabled:true,writable:true},
  {storageId:2,label:'阿里',mountPath:'/ali',rootPath:'/ali/app',enabled:true,writable:true},
  {storageId:3,label:'123',mountPath:'/123',rootPath:'/123/app',enabled:true,writable:true}
]};
const mounts=replica.mounts.map(x=>({...x,error:null,renameSuggestions:[]}));

describe('replica sync planning',()=>{
  test('verified source outranks higher-priority unverified source',()=>{
    const preview={generatedAt:'2026-09-14T00:00:00Z',mounts,rows:[{relativePath:'A.ipa',copies:{1:true,2:true,3:false},copyStatus:{1:'unverified',2:'verified',3:'missing'}}]};
    const plan=buildReplicaSyncPlan(preview,replica,{limit:20,targetStorageIds:[3]});
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0]).toMatchObject({sourceStorageId:2,targetStorageId:3,sourceStatus:'verified'});
    expect(plan.summary.verifiedSourceActions).toBe(1);
  });

  test('mount order is source priority when integrity level is equal',()=>{
    const preview={generatedAt:'2026-09-14T00:00:00Z',mounts,rows:[{relativePath:'B.ipa',copies:{1:true,2:true,3:false},copyStatus:{1:'verified',2:'verified',3:'missing'}}]};
    const plan=buildReplicaSyncPlan(preview,replica,{limit:20,targetStorageIds:[3]});
    expect(plan.actions[0].sourceStorageId).toBe(1);
    expect(plan.sourcePriority.map(x=>x.storageId)).toEqual([1,2,3]);
  });

  test('integrity-mismatch target is blocked instead of overwritten',()=>{
    const preview={generatedAt:'2026-09-14T00:00:00Z',mounts,rows:[{relativePath:'C.ipa',copies:{1:true,2:true,3:true},copyStatus:{1:'verified',2:'verified',3:'md5_mismatch'}}]};
    const plan=buildReplicaSyncPlan(preview,replica,{limit:20,targetStorageIds:[3]});
    expect(plan.actions).toHaveLength(0);
    expect(plan.summary.blockedIntegrity).toBe(1);
  });

  test('plan hash is deterministic and target filter is respected',()=>{
    const preview={generatedAt:'2026-09-14T00:00:00Z',mounts,rows:[
      {relativePath:'D.ipa',copies:{1:true,2:false,3:false},copyStatus:{1:'verified',2:'missing',3:'missing'}},
      {relativePath:'E.ipa',copies:{1:true,2:false,3:false},copyStatus:{1:'verified',2:'missing',3:'missing'}}
    ]};
    const a=buildReplicaSyncPlan(preview,replica,{limit:20,targetStorageIds:[2]});
    const b=buildReplicaSyncPlan(preview,replica,{limit:20,targetStorageIds:[2]});
    expect(a.actions).toHaveLength(2);
    expect(a.actions.every(x=>x.targetStorageId===2)).toBe(true);
    expect(a.planHash).toMatch(/^[a-f0-9]{64}$/);
    expect(a.planHash).toBe(b.planHash);
  });
});
