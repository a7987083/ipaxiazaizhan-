import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

describe('1226+ account-switch recovery contract',()=>{
  const root=fileURLToPath(new URL('../../../',import.meta.url));
  test('version includes the 2026091226 account-switch fix or newer',()=>{
    const version=Number(fs.readFileSync(`${root}/VERSION`,'utf8').trim());
    expect(version).toBeGreaterThanOrEqual(2026091226);
  });
  test('account switch fix is documented as MD5-addressed, not path-addressed',()=>{
    const doc=fs.readFileSync(`${root}/ACCOUNT_SWITCH_FIX.md`,'utf8');
    expect(doc).toContain('keyed by normalized MD5');
    expect(doc).toContain('Changing a cloud account');
    expect(doc).toContain('already-lost parse records');
  });
});