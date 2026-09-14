import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { auditIpaResult, metadataChanged, publicUrlToApiPath, RECOMMENDED_OPENLIST_SCHEDULE, safeAppRef } from '../src/services/openListMetadataService.js';
import { normalizeSchedule } from '../src/storage/controlStore.js';

describe('OpenList IPA metadata sync contract',()=>{
  const root=fileURLToPath(new URL('../../../',import.meta.url));
  const cfg={url:'https://yun.zonoeios.xyz',publicPathPrefix:'/d/a/app/',apiBasePath:'/'};

  test('maps public /d/a/app URL to token-scoped OpenList API path',()=>{
    expect(publicUrlToApiPath('http://yun.zonoeios.xyz/d/a/app/ToF%202.ipa',cfg)).toBe('/ToF 2.ipa');
    expect(publicUrlToApiPath('https://yun.zonoeios.xyz/d/a/app/folder/A.ipa',cfg)).toBe('/folder/A.ipa');
    expect(publicUrlToApiPath('https://other.example/d/a/app/A.ipa',cfg)).toBeNull();
  });

  test('MD5 is authoritative for change detection',()=>{
    expect(metadataChanged({md5:'ABC',size:1,modified:'old'},{md5:'abc',size:2,modified:'new'})).toBe(false);
    expect(metadataChanged({md5:'ABC',size:1,modified:'x'},{md5:'DEF',size:1,modified:'x'})).toBe(true);
  });

  test('falls back to size + modified when provider has no hash',()=>{
    expect(metadataChanged({md5:'',size:100,modified:'x'},{md5:'',size:100,modified:'x'})).toBe(false);
    expect(metadataChanged({md5:'',size:100,modified:'x'},{md5:'',size:101,modified:'x'})).toBe(true);
    expect(metadataChanged({md5:'',size:100,modified:'x'},{md5:'',size:100,modified:'y'})).toBe(true);
  });

  test('safe cached app reference never persists bt1a/download URL',()=>{
    const ref=safeAppRef({appKey:'app1:7',sourceSlug:'app1',sourceName:'源 1',legacyId:7,name:'Demo',version:'1.2',dbSize:100,apiPath:'/Demo.ipa',downloadUrl:'https://secret.example/file.ipa'});
    expect(ref).toEqual({appKey:'app1:7',sourceSlug:'app1',sourceName:'源 1',legacyId:7,name:'Demo',version:'1.2',dbSize:100,apiPath:'/Demo.ipa'});
    expect(ref).not.toHaveProperty('downloadUrl');
  });

  test('control cache schema preserves appRefs in version 3',()=>{
    const store=fs.readFileSync(`${root}/apps/api/src/storage/controlStore.js`,'utf8');
    expect(store).toContain('version:3,files:{}');
    expect(store).toContain('appRefs:value?.appRefs||{}');
  });

  test('result audit flags source/package version and meaningful size mismatch',()=>{
    expect(auditIpaResult({version:'1.2',dbSize:100*1024*1024},{size:100*1024*1024,parsed:{version:'1.2'}}).mismatch).toBe(false);
    const version=auditIpaResult({version:'1.2',dbSize:100*1024*1024},{size:100*1024*1024,parsed:{version:'1.3'}});
    expect(version.versionMismatch).toBe(true);
    const size=auditIpaResult({version:'1.2',dbSize:120*1024*1024},{size:100*1024*1024,parsed:{version:'1.2'}});
    expect(size.sizeMismatch).toBe(true);
    const smallDelta=auditIpaResult({dbSize:100*1024*1024+512*1024},{size:100*1024*1024,parsed:{}});
    expect(smallDelta.sizeMismatch).toBe(false);
  });

  test('scheduler is configurable and the saved per-run count is authoritative',()=>{
    expect(RECOMMENDED_OPENLIST_SCHEDULE.intervalMinutes).toBe(15);
    expect(RECOMMENDED_OPENLIST_SCHEDULE.parseLimit).toBe(1);
    expect(normalizeSchedule({enabled:true,intervalMinutes:1,parseLimit:99})).toEqual({enabled:true,intervalMinutes:5,parseLimit:20});
    const service=fs.readFileSync(`${root}/apps/api/src/services/openListMetadataService.js`,'utf8');
    expect(service).toContain('intervalMinutes:Math.min(1440,Math.max(5');
    expect(service).toContain('parseLimit:Math.min(20,Math.max(1');
    expect(service).toContain('const selected=eligible.slice(0,parseLimit);');
    expect(service).not.toContain('intervalMinutes:Math.max(15');
    expect(service).not.toContain('parseLimit:1\n  };');
    expect(service).not.toContain('budgetAllowed');
    expect(service).not.toContain('budgetBlocked');
  });
});
