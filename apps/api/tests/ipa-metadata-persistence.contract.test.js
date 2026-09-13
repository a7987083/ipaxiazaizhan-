import { describe, expect, test } from 'vitest';
import { seedMetadataLibraryFromCache,getParsedMetadataByMd5 } from '../src/services/ipaMetadataLibrary.js';
import { hydrateIpaCacheByMd5 } from '../src/services/ipaMetadataPersistenceService.js';

const MD5_A='AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const MD5_B='BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

describe('persistent IPA metadata by content identity',()=>{
  test('migrates current v3 path-bound parse result into MD5 library',()=>{
    const library=seedMetadataLibraryFromCache({version:1,entries:{}},{files:{
      '/old-account/App.ipa':{
        md5:MD5_A,parsedMd5:MD5_A,size:123456,
        parsed:{name:'App',version:'1.2.3',build:'45',bundle_id:'com.demo.app',minimum_ios:'12.0',executable:'App'},
        parsedAt:'2026-09-14T00:00:00.000Z',parseError:''
      }
    }});
    expect(Object.keys(library.entries)).toEqual([MD5_A]);
    expect(library.entries[MD5_A].parsed.bundle_id).toBe('com.demo.app');
  });

  test('same IPA on a new account/path inherits old parse result by MD5',()=>{
    const oldCache={files:{'/old-account/App.ipa':{
      md5:MD5_A,parsedMd5:MD5_A,size:123456,
      parsed:{name:'App',version:'1.2.3',build:'45',bundle_id:'com.demo.app',minimum_ios:'12.0',executable:'App'},
      parsedAt:'2026-09-14T00:00:00.000Z',parseError:''
    }}};
    const library=seedMetadataLibraryFromCache({version:1,entries:{}},oldCache);
    const nextCache={version:3,files:{'/new-account/folder/Renamed.ipa':{
      name:'Renamed.ipa',md5:MD5_A,size:123456,modified:'new',parsed:null,parsedMd5:'',parseError:'',missing:false
    }},apps:{'source:1':'/new-account/folder/Renamed.ipa'},appRefs:{},missingEntries:[],lastSync:{finishedAt:'later'}};
    const out=hydrateIpaCacheByMd5(nextCache,library);
    expect(out.reused).toBe(1);
    expect(out.cache.files['/new-account/folder/Renamed.ipa'].parsed.bundle_id).toBe('com.demo.app');
    expect(out.cache.files['/new-account/folder/Renamed.ipa'].parsedMd5).toBe(MD5_A);
    expect(out.cache.files['/new-account/folder/Renamed.ipa'].parseError).toBe('');
  });

  test('different MD5 is never treated as the previous IPA',()=>{
    const library=seedMetadataLibraryFromCache({version:1,entries:{}},{files:{'/old.ipa':{
      md5:MD5_A,parsedMd5:MD5_A,size:100,parsed:{bundle_id:'com.demo.old'},parsedAt:'x',parseError:''
    }}});
    const out=hydrateIpaCacheByMd5({files:{'/new.ipa':{md5:MD5_B,size:100,parsed:null,parsedMd5:'',parseError:'',missing:false}}},library);
    expect(out.reused).toBe(0);
    expect(out.cache.files['/new.ipa'].parsed).toBeNull();
  });

  test('same MD5 with conflicting known size is rejected defensively',()=>{
    const library=seedMetadataLibraryFromCache({version:1,entries:{}},{files:{'/old.ipa':{
      md5:MD5_A,parsedMd5:MD5_A,size:100,parsed:{bundle_id:'com.demo.old'},parsedAt:'x',parseError:''
    }}});
    expect(getParsedMetadataByMd5(library,MD5_A,101)).toBeNull();
  });

  test('stale or failed parse result is not promoted into persistent library',()=>{
    const library=seedMetadataLibraryFromCache({version:1,entries:{}},{files:{
      '/stale.ipa':{md5:MD5_A,parsedMd5:MD5_B,size:100,parsed:{bundle_id:'bad.stale'},parseError:''},
      '/failed.ipa':{md5:MD5_B,parsedMd5:MD5_B,size:100,parsed:{bundle_id:'bad.failed'},parseError:'failed'}
    }});
    expect(Object.keys(library.entries)).toHaveLength(0);
  });
});