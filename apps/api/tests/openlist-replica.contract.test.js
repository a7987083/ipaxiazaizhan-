import {describe,test,expect} from 'vitest';
import {buildReplicaDiff,relativeFromApiPath,replicaIntegrityStatus} from '../src/services/openListReplicaService.js';

describe('OpenList multi-drive replica management',()=>{
  test('relative path is derived from configured OpenList API base',()=>{
    expect(relativeFromApiPath('/a/app/Foo.ipa','/a/app')).toBe('Foo.ipa');
    expect(relativeFromApiPath('/a/app/sub/Foo.ipa','/a/app')).toBe('sub/Foo.ipa');
    expect(relativeFromApiPath('/other/Foo.ipa','/a/app')).toBe(null);
  });

  test('replica diff reports missing/extra and MD5 rename suggestion',()=>{
    const expected=[
      {relativePath:'Ellen.ipa',md5:'AAA',size:100,apps:[{name:'Ellen'}]},
      {relativePath:'Ouros.ipa',md5:'BBB',size:200,apps:[{name:'Ouros'}]}
    ];
    const out=buildReplicaDiff(expected,[
      {storageId:1,label:'天翼',mountPath:'/tianyi',rootPath:'/tianyi/app',writable:true,files:{
        'Ellen.ipa':{relativePath:'Ellen.ipa',md5:'AAA',size:100},
        'old-Ouros.ipa':{relativePath:'old-Ouros.ipa',md5:'BBB',size:200},
        'Extra.ipa':{relativePath:'Extra.ipa',md5:'CCC',size:300}
      }},
      {storageId:2,label:'阿里',mountPath:'/ali',rootPath:'/ali/app',writable:true,files:{
        'Ellen.ipa':{relativePath:'Ellen.ipa',md5:'AAA',size:100}
      }}
    ]);
    expect(out.expectedCount).toBe(2);
    expect(out.mounts[0].missing).toHaveLength(1);
    expect(out.mounts[0].extra).toHaveLength(2);
    expect(out.mounts[0].verified).toBe(1);
    expect(out.mounts[0].renameSuggestions).toEqual([{fromRelative:'old-Ouros.ipa',toRelative:'Ouros.ipa',md5:'BBB'}]);
    expect(out.mounts[1].missing).toHaveLength(1);
    expect(out.rows.find(x=>x.relativePath==='Ouros.ipa').copies[1]).toBe(false);
    expect(out.rows.find(x=>x.relativePath==='Ouros.ipa').copyStatus[1]).toBe('missing');
  });

  test('same MD5 in another folder is not silently suggested as rename',()=>{
    const out=buildReplicaDiff([{relativePath:'games/App.ipa',md5:'DDD'}],[{storageId:1,files:{'other/App-old.ipa':{relativePath:'other/App-old.ipa',md5:'DDD'}}}]);
    expect(out.mounts[0].renameSuggestions).toHaveLength(0);
  });

  test('integrity states distinguish verified, hash mismatch, size mismatch, unverified and missing',()=>{
    expect(replicaIntegrityStatus({md5:'AAA',size:100},{md5:'AAA',size:100})).toBe('verified');
    expect(replicaIntegrityStatus({md5:'AAA',size:100},{md5:'BBB',size:100})).toBe('md5_mismatch');
    expect(replicaIntegrityStatus({md5:'AAA',size:100},{md5:'AAA',size:101})).toBe('size_mismatch');
    expect(replicaIntegrityStatus({md5:'',size:100},{md5:'',size:100})).toBe('unverified');
    expect(replicaIntegrityStatus({md5:'AAA',size:100},null)).toBe('missing');
  });

  test('path exists but wrong content is not counted as verified',()=>{
    const out=buildReplicaDiff([
      {relativePath:'Good.ipa',md5:'AAA',size:100},
      {relativePath:'HashBad.ipa',md5:'BBB',size:200},
      {relativePath:'SizeBad.ipa',md5:'CCC',size:300},
      {relativePath:'NoHash.ipa',md5:'',size:400}
    ],[{storageId:9,files:{
      'Good.ipa':{relativePath:'Good.ipa',md5:'AAA',size:100},
      'HashBad.ipa':{relativePath:'HashBad.ipa',md5:'ZZZ',size:200},
      'SizeBad.ipa':{relativePath:'SizeBad.ipa',md5:'CCC',size:301},
      'NoHash.ipa':{relativePath:'NoHash.ipa',md5:'',size:400}
    }}]);
    expect(out.mounts[0].present).toBe(4);
    expect(out.mounts[0].verified).toBe(1);
    expect(out.mounts[0].unverified).toBe(1);
    expect(out.mounts[0].integrityIssues.map(x=>x.status).sort()).toEqual(['md5_mismatch','size_mismatch']);
    expect(out.rows.find(x=>x.relativePath==='HashBad.ipa').copyStatus[9]).toBe('md5_mismatch');
  });
});
