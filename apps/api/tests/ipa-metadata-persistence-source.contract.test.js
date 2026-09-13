import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

describe('account-independent metadata persistence source contract',()=>{
  const root=fileURLToPath(new URL('../../../',import.meta.url));
  test('server starts metadata persistence before OpenList scheduler',()=>{
    const server=fs.readFileSync(`${root}/apps/api/src/server.js`,'utf8');
    expect(server.indexOf('startIpaMetadataPersistence()')).toBeGreaterThan(-1);
    expect(server.indexOf('startOpenListScheduler()')).toBeGreaterThan(server.indexOf('startIpaMetadataPersistence()'));
  });
  test('persistent metadata library is not path keyed and cache clear is explicit',()=>{
    const library=fs.readFileSync(`${root}/apps/api/src/services/ipaMetadataLibrary.js`,'utf8');
    expect(library).toContain("openlist-ipa-metadata-library.json");
    expect(library).toContain('entries[item.md5]');
    expect(library).toContain('clearIpaMetadataLibrary');
    expect(library).not.toContain('downloadUrl');
    expect(library).not.toContain('raw_url');
  });
  test('OpenList account/config changes invalidate directory listing cache',()=>{
    const persistence=fs.readFileSync(`${root}/apps/api/src/services/ipaMetadataPersistenceService.js`,'utf8');
    expect(persistence).toContain("writeOpenListDirectoryCache({version:1,scopeKey:'',directories:{}})");
    expect(persistence).toContain('cfg?.updatedAt');
  });
});