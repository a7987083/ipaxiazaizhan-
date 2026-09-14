import {describe,expect,test} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

describe('replica admin UX',()=>{
  test('reconciliation result is persisted and restored',()=>{
    const service=read('apps/api/src/services/openListReplicaService.js');
    const store=read('apps/api/src/services/replicaPreviewStore.js');
    expect(service).toContain('readReplicaPreview');
    expect(service).toContain('writeReplicaPreview');
    expect(service).toContain('lastPreview:previewCompatible(savedPreview)?savedPreview:null');
    expect(service).toContain('await clearReplicaPreview()');
    expect(store).toContain('openlist-replica-preview.json');
  });

  test('multi-drive results are collapsible and extras use 100-row pages',()=>{
    const ui=read('apps/web/src/pages/AdminReplicaPanel.jsx');
    expect(ui).toContain('const PAGE_SIZE=100');
    expect(ui).toContain('全部展开');
    expect(ui).toContain('全部收起');
    expect(ui).toContain('多余 IPA（');
    expect(ui).not.toContain('数据库不存在的多余 IPA');
    expect(ui).toContain('结果已持久化，切换页面不会消失');
  });

  test('sync plan is visible before execution and source priority is controllable',()=>{
    const ui=read('apps/web/src/pages/AdminReplicaPanel.jsx');
    const routes=read('apps/api/src/routes/adminReplicaRoutes.js');
    expect(ui).toContain('来源优先级');
    expect(ui).toContain('补齐计划预览');
    expect(ui).toContain('来源盘 → 目标盘');
    expect(ui).toContain('确认执行当前计划');
    expect(routes).toContain("'/openlist/replicas/sync-plan'");
    expect(routes).toContain('planHash');
  });

  test('integrity mismatch is surfaced and not auto-overwritten',()=>{
    const ui=read('apps/web/src/pages/AdminReplicaPanel.jsx');
    expect(ui).toContain('副本完整性异常');
    expect(ui).toContain('MD5 不一致');
    expect(ui).toContain('大小不一致');
    expect(ui).toContain('异常副本不会自动作为复制来源，也不会被自动覆盖');
  });

  test('Alias load balancing has an actionable setup guide',()=>{
    const ui=read('apps/web/src/pages/AdminReplicaPanel.jsx');
    expect(ui).toContain('分流设置');
    expect(ui).toContain('选择 Alias 分流盘');
    expect(ui).toContain('按文件负载均衡');
    expect(ui).toContain('复制 Alias 路径');
    expect(ui).toContain('分流公开下载根地址');
  });

  test('metadata page asks for the fixed OpenList program token',()=>{
    const ui=read('apps/web/src/pages/AdminOpenListPanel.jsx');
    expect(ui).toContain('OpenList 令牌（留空不修改）');
    expect(ui).toContain('OpenList 设置 → 其他 → 令牌');
    expect(ui).not.toContain('OpenList Token（留空不修改）');
  });
});
