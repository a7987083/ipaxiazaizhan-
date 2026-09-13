import { describe, expect, test } from 'vitest';
import { metadataChanged, publicUrlToApiPath, RECOMMENDED_OPENLIST_SCHEDULE } from '../src/services/openListMetadataService.js';
import { normalizeSchedule } from '../src/storage/controlStore.js';

describe('OpenList IPA metadata sync contract',()=>{
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

  test('scheduler has conservative Tianyi defaults and safe bounds',()=>{
    expect(RECOMMENDED_OPENLIST_SCHEDULE.intervalMinutes).toBe(10);
    expect(RECOMMENDED_OPENLIST_SCHEDULE.parseLimit).toBe(3);
    expect(normalizeSchedule({enabled:true,intervalMinutes:1,parseLimit:99})).toEqual({enabled:true,intervalMinutes:5,parseLimit:20});
    expect(normalizeSchedule({})).toEqual({enabled:false,intervalMinutes:10,parseLimit:3});
  });
});
