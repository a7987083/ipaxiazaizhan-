import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReplicaDiff,relativeFromApiPath} from '../src/services/openListReplicaService.js';

test('relative path is derived from configured OpenList API base',()=>{
  assert.equal(relativeFromApiPath('/a/app/Foo.ipa','/a/app'),'Foo.ipa');
  assert.equal(relativeFromApiPath('/a/app/sub/Foo.ipa','/a/app'),'sub/Foo.ipa');
  assert.equal(relativeFromApiPath('/other/Foo.ipa','/a/app'),null);
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
  assert.equal(out.expectedCount,2);
  assert.equal(out.mounts[0].missing.length,1);
  assert.equal(out.mounts[0].extra.length,2);
  assert.deepEqual(out.mounts[0].renameSuggestions,[{fromRelative:'old-Ouros.ipa',toRelative:'Ouros.ipa',md5:'BBB'}]);
  assert.equal(out.mounts[1].missing.length,1);
  assert.equal(out.rows.find(x=>x.relativePath==='Ouros.ipa').copies[1],false);
  assert.equal(out.rows.find(x=>x.relativePath==='Ouros.ipa').copies[2],false);
});

test('same MD5 in another folder is not silently suggested as rename',()=>{
  const out=buildReplicaDiff([{relativePath:'games/App.ipa',md5:'DDD'}],[{storageId:1,files:{'other/App-old.ipa':{relativePath:'other/App-old.ipa',md5:'DDD'}}}]);
  assert.equal(out.mounts[0].renameSuggestions.length,0);
});
