import { describe, expect, test } from 'vitest';
import { compareNumericVersions, filterPublicIpaIndex, publicIpaMetadata } from '../src/repositories/appRepository.js';

describe('public IPA metadata filters',()=>{
  const cache={
    apps:{'app1:7':'/Demo.ipa','app1:8':'/Pending.ipa','app2:9':'/Broken.ipa'},
    appRefs:{
      'app1:7':{appKey:'app1:7',sourceSlug:'app1',sourceName:'源 1',legacyId:7,name:'Demo',version:'1.2',apiPath:'/Demo.ipa'},
      'app1:8':{appKey:'app1:8',sourceSlug:'app1',sourceName:'源 1',legacyId:8,name:'Pending',version:'2.0',apiPath:'/Pending.ipa'},
      'app2:9':{appKey:'app2:9',sourceSlug:'app2',sourceName:'源 2',legacyId:9,name:'Broken',version:'3.0',apiPath:'/Broken.ipa'}
    },
    files:{
      '/Demo.ipa':{name:'Demo.ipa',size:123,md5:'AAA',parsedMd5:'AAA',parsed:{name:'Demo Package',version:'1.2.1',build:'42',bundle_id:'com.example.demo',minimum_ios:'12.3',executable:'Demo'}},
      '/Pending.ipa':{name:'Pending.ipa',size:456,md5:'BBB',parsedMd5:'OLD',parsed:{name:'Old',version:'1.9',bundle_id:'com.example.pending',minimum_ios:'11.0'}},
      '/Broken.ipa':{name:'Broken.ipa',size:789,md5:'CCC',parsedMd5:'CCC',parseError:'bad zip',parsed:{name:'Broken Old',version:'2.9',bundle_id:'com.example.broken',minimum_ios:'10.0'}}
    }
  };
  const index=Object.keys(cache.apps).map(appId=>{const ref=cache.appRefs[appId];return {appId,sourceSlug:ref.sourceSlug,legacyId:ref.legacyId,ref,ipa:publicIpaMetadata(cache,appId)}});

  test('numeric iOS comparison is version-aware',()=>{
    expect(compareNumericVersions('10.10','10.2')).toBe(1);
    expect(compareNumericVersions('12.3','12.3.0')).toBe(0);
    expect(compareNumericVersions('9.3.5','10')).toBe(-1);
  });

  test('stale or failed parsed metadata is never treated as current public metadata',()=>{
    const parsed=publicIpaMetadata(cache,'app1:7');
    expect(parsed.status).toBe('parsed');
    expect(parsed.bundleId).toBe('com.example.demo');
    const pending=publicIpaMetadata(cache,'app1:8');
    expect(pending.status).toBe('pending');
    expect(pending.bundleId).toBe('');
    expect(pending.minimumIos).toBe('');
    const failed=publicIpaMetadata(cache,'app2:9');
    expect(failed.status).toBe('failed');
    expect(failed.bundleId).toBe('');
    expect(failed.packageVersion).toBe('');
  });

  test('search includes only current Bundle ID and package metadata',()=>{
    expect(filterPublicIpaIndex(index,{q:'com.example.demo'}).map(x=>x.appId)).toEqual(['app1:7']);
    expect(filterPublicIpaIndex(index,{q:'demo package'}).map(x=>x.appId)).toEqual(['app1:7']);
    expect(filterPublicIpaIndex(index,{q:'42'}).map(x=>x.appId)).toEqual(['app1:7']);
    expect(filterPublicIpaIndex(index,{q:'com.example.pending'})).toEqual([]);
    expect(filterPublicIpaIndex(index,{q:'com.example.broken'})).toEqual([]);
  });

  test('target iOS only includes parsed apps whose minimum OS is compatible',()=>{
    expect(filterPublicIpaIndex(index,{ios:'12'})).toEqual([]);
    expect(filterPublicIpaIndex(index,{ios:'12.3'}).map(x=>x.appId)).toEqual(['app1:7']);
    expect(filterPublicIpaIndex(index,{ios:'16'}).map(x=>x.appId)).toEqual(['app1:7']);
  });

  test('status filters remain available without exposing stale package fields',()=>{
    expect(filterPublicIpaIndex(index,{ipa:'pending'}).map(x=>x.appId)).toEqual(['app1:8']);
    expect(filterPublicIpaIndex(index,{ipa:'failed'}).map(x=>x.appId)).toEqual(['app2:9']);
  });
});
