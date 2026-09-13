import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

describe('1226 account-switch recovery contract',()=>{
  const root=fileURLToPath(new URL('../../../',import.meta.url));
  test('version is 2026091226',()=>expect(fs.readFileSync(`${root}/VERSION`,'utf8').trim()).toBe('2026091226'));
  test('account switch fix is documented as MD5-addressed, not path-addressed',()=>{
    const doc=fs.readFileSync(`${root}/ACCOUNT_SWITCH_FIX.md`,'utf8');
    expect(doc).toContain('keyed by normalized MD5');
    expect(doc).toContain('Changing a cloud account');
    expect(doc).toContain('already-lost parse records');
  });
});