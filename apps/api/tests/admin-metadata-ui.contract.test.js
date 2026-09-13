import {describe,expect,test} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

describe('admin IPA metadata and dynamic sync UI',()=>{
  test('metadata library shows explicit Build labels and download addresses',()=>{
    const s=read('apps/web/src/pages/AdminOpenListPanel.jsx');
    expect(s).toContain('Build：');
    expect(s).toContain('下载地址');
    expect(s).toContain('打开下载地址');
    expect(s).toContain('/openlist/results-rich');
    expect(s).toContain('缺失 IPA 对应数据库条目');
  });

  test('write-back mapping is dynamic and understandable',()=>{
    const s=read('apps/web/src/pages/AdminWriteBackPanel.jsx');
    expect(s).toContain('新增映射规则');
    expect(s).toContain('允许手动写入数据库');
    expect(s).toContain('IPA 解析成功后自动写入数据库');
    expect(s).toContain('选择数据来源');
    expect(s).toContain('bt1a');
  });

  test('admin rich results route keeps download URLs admin-only',()=>{
    const app=read('apps/api/src/app.js');
    const route=read('apps/api/src/routes/adminMetadataRoutes.js');
    const service=read('apps/api/src/services/adminIpaMetadataService.js');
    expect(app).toContain('adminMetadataRoutes');
    expect(route).toContain('requireAdmin,requireCsrf');
    expect(route).toContain('/openlist/results-rich');
    expect(service).toContain('HEX(CAST(bt1a AS CHAR))');
    expect(service).toContain('downloadUrl');
  });
});
