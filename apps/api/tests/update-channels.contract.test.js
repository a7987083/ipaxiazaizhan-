import {describe,expect,test} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

describe('dual-channel online updater contract',()=>{
  test('API exposes stable and preview channels and pins preview to successful CI ref',()=>{
    const s=read('apps/api/src/services/updateService.js');
    expect(s).toContain("id:'stable'");
    expect(s).toContain("id:'preview'");
    expect(s).toContain("actions/workflows/ci-release.yml/runs");
    expect(s).toContain("status=success");
    expect(s).toContain("request.ref=target.ref");
    expect(s).toContain("force:false");
  });

  test('root worker only accepts stable or preview and preview uses exact commit ref',()=>{
    const s=read('scripts/admin-update-worker.sh');
    expect(s).toContain('channel not in {"stable","preview"}');
    expect(s).toContain('/bin/bash "$ROOT/update.sh" --ref "$REF"');
    expect(s).toContain('/bin/bash "$ROOT/update.sh" --stable');
    expect(s).not.toContain('--force >>');
  });

  test('admin UI checks both channels and sends selected channel',()=>{
    const s=read('apps/web/src/pages/Admin.jsx');
    expect(s).toContain('检查两个通道');
    expect(s).toContain('预览版 Preview');
    expect(s).toContain('稳定版 Stable Release');
    expect(s).toContain('JSON.stringify({channel})');
  });

  test('deploy engine keeps automatic backup and rollback',()=>{
    const s=read('scripts/lib-deploy.sh');
    expect(s).toContain('backup_current');
    expect(s).toContain('restore_backup');
    expect(s).toContain('部署失败，已尝试自动回滚');
  });
});
