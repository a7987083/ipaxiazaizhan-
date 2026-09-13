import {describe,test,expect} from 'vitest';
import {buildReplicaDiff,relativeFromApiPath} from '../src/services/openListReplicaService.js';

describe('OpenList multi-drive replica management',()=>{
  test('relative path is derived from configured OpenList API base',()=>{
    expect(relativeFromApiPath('/a/app/Foo.ipa','/a/app')).toBe('Foo.ipa');
    expect(relativeFromApiPath('/a/app/sub/Foo.ipa','/a/app')).toBe('sub/Foo.ipa');
    expect(relativeFromApiPath('/other/Foo.ipa','/a/app')).toBe(null);
  });

  test('replica diff reports missing/extra and MD5 rename suggestion',()=>{
    const expected=[
      {relativePath:'Ellen.ipa',md5:'AAA',apps:[{name:'Ellen'}]},
      {relativePath:'Ouros.ipa',md5:'BBB',apps:[{name:'Ouros'}]}
    ];
    const out=buildReplicaDiff(expected,[
      {storageId:1,label:'天翼',mountPath:'/tianyi',rootPath:'/tianyi/app',writable:true,files:{
        'Ellen.ipa':{relativePath:'Ellen.ipa',md5:'AAA'},
        'old-Ouros.ipa':{relativePath:'old-Ouros.ipa',md5:'BBB'},
        'Extra.ipa':{relativePath:'Extra.ipa',md5:'CCC'}
      }},
      {storageId:2,label:'阿里',mountPath:'/ali',rootPath:'/ali/app',writable:true,files:{
        'Ellen.ipa':{relativePath:'Ellen.ipa',md5:'AAA'}
      }}
    ]);
    expect(out.expectedCount).toBe(2);
    expect(out.mounts[0].missing).toHaveLength(1);
    expect(out.mounts[0].extra).toHaveLength(2);
    expect(out.mounts[0].renameSuggestions).toEqual([{fromRelative:'old-Ouros.ipa',toRelative:'Ouros.ipa',md5:'BBB'}]);
    expect(out.mounts[1].missing).toHaveLength(1);
    expect(out.rows.find(x=>x.relativePath==='Ouros.ipa').copies[1]).toBe(false);
    expect(out.rows.find(x=>x.relativePath==='Ouros.ipa').copies[2]).toBe(false);
  });

  test('same MD5 in another folder is not silently suggested as rename',()=>{
    const out=buildReplicaDiff([{relativePath:'games/App.ipa',md5:'DDD'}],[{storageId:1,files:{'other/App-old.ipa':{relativePath:'other/App-old.ipa',md5:'DDD'}}}]);
    expect(out.mounts[0].renameSuggestions).toHaveLength(0);
  });
});
