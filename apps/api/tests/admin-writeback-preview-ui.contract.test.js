import {describe,expect,test} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

describe('admin write-back preview UI',()=>{
  test('shows all scanned apps instead of hiding unchanged rows',()=>{
    const s=read('apps/web/src/pages/AdminWriteBackPanel.jsx');
    expect(s).toContain("previewFilter==='all'");
    expect(s).toContain('全部已扫描 App');
    expect(s).toContain('仅有字段差异');
    expect(s).toContain('仅可写变化');
    expect(s).toContain('无差异：当前启用规则对应的数据与数据库一致，无需写入。');
    expect(s).not.toContain('preview.items?.filter(x=>x.previewCount>0).map');
  });
});
