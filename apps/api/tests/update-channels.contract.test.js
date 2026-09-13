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
    expect(s).toContain('checkRemote && !busy');
  });

  test('root worker only accepts stable or preview, uses exact preview ref, and publishes dynamic progress',()=>{
    const s=read('scripts/admin-update-worker.sh');
    expect(s).toContain('channel not in {"stable","preview"}');
    expect(s).toContain('/bin/bash "$ROOT/update.sh" --ref "$REF"');
    expect(s).toContain('/bin/bash "$ROOT/update.sh" --stable');
    expect(s).toContain('progress_from_log');
    expect(s).toContain('[100%] 在线更新完成');
    expect(s).toContain('errorDetail');
    expect(s).not.toContain('--force >>');
  });

  test('admin UI checks both channels and sends selected channel',()=>{
    const s=read('apps/web/src/pages/Admin.jsx');
    expect(s).toContain('检查两个通道');
    expect(s).toContain('预览版 Preview');
    expect(s).toContain('稳定版 Stable Release');
    expect(s).toContain('JSON.stringify({channel})');
  });

  test('deploy engine preserves persistent control state and can roll back',()=>{
    const s=read('scripts/lib-deploy.sh');
    expect(s).toContain('backup_current');
    expect(s).toContain('restore_backup');
    expect(s).toContain('restore_persistent_state_after_install');
    expect(s).toContain("--exclude='openlist-task.json'");
    expect(s).toContain('merge_old_env_values');
    expect(s).toContain('新版本启动后持久配置恢复/健康检查失败');
  });


  test('native update keeps rollback dependencies independent and validates runtime imports',()=>{
    const updater=read('update.sh');
    const installer=read('install.sh');
    const worker=read('scripts/admin-update-worker.sh');
    expect(updater).toContain('cp -a --reflink=auto');
    expect(updater).not.toContain('cp -al "$src" "$dst"');
    expect(installer).toContain('api_runtime_import_smoke');
    expect(installer).toContain('清理 node_modules 后重新安装一次');
    expect(worker).toContain('ERR_MODULE_NOT_FOUND');
    expect(worker).toContain('更新失败，恢复更新前 Node 依赖');
  });

  test('frontend treats updater 502/503 as a restart window instead of a final error',()=>{
    const s=read('apps/web/src/lib/api.js');
    expect(s).toContain('isUpdateStatusGet');
    expect(s).toContain('121');
    expect(s).toContain('服务正在更新/重启');
  });
});
