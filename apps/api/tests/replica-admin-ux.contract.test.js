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
    expect(service).toContain('lastPreview:await readReplicaPreview()');
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
