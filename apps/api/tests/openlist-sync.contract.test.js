import { describe, expect, test } from 'vitest';
import { metadataChanged, publicUrlToApiPath } from '../src/services/openListMetadataService.js';

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
});
