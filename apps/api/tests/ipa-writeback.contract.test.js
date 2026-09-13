import { describe,expect,test } from 'vitest';
import { buildWriteBackPlan,normalizeWriteBackConfig,validateWriteBackConfig } from '../src/services/ipaWriteBackService.js';

describe('IPA write-back mapping',()=>{
  const columns=[{name:'name'},{name:'nickname'},{name:'bundle_id'},{name:'bt1a'},{name:'bt2a'},{name:'min_ios'}];

  test('write-back defaults stay disabled and expose editable rules',()=>{
    const cfg=normalizeWriteBackConfig({});
    expect(cfg.enabled).toBe(false);
    expect(cfg.autoApply).toBe(false);
    expect(Array.isArray(cfg.rules)).toBe(true);
    expect(cfg.rules.length).toBeGreaterThan(0);
    expect(cfg.rules.every(x=>x.enabled===false)).toBe(true);
  });

  test('legacy fixed mappings migrate into editable rules',()=>{
    const cfg=normalizeWriteBackConfig({
      enabled:true,
      mappings:{package_version:{enabled:true,column:'nickname',strategy:'changed'}}
    });
    const rule=cfg.rules.find(x=>x.source==='package_version');
    expect(rule).toBeTruthy();
    expect(rule.enabled).toBe(true);
    expect(rule.column).toBe('nickname');
  });

  test('custom rule can map IPA download URL to bt1a',()=>{
    const cfg=normalizeWriteBackConfig({
      enabled:true,
      rules:[{id:'download',enabled:true,source:'download_url',column:'bt1a',strategy:'changed'}]
    });
    const out=validateWriteBackConfig(cfg,columns);
    expect(out.ok).toBe(true);
    const changes=buildWriteBackPlan({
      metadata:{download_url:'https://example.test/d/a/app/demo.ipa'},
      current:{bt1a:'https://old.example/demo.ipa'},
      config:cfg
    });
    expect(changes).toHaveLength(1);
    expect(changes[0].field).toBe('download_url');
    expect(changes[0].column).toBe('bt1a');
    expect(changes[0].willWrite).toBe(true);
  });

  test('duplicate target columns are rejected even with custom rules',()=>{
    const cfg=normalizeWriteBackConfig({
      enabled:true,
      rules:[
        {id:'version',enabled:true,source:'package_version',column:'nickname',strategy:'changed'},
        {id:'build',enabled:true,source:'package_build',column:'nickname',strategy:'changed'}
      ]
    });
    const out=validateWriteBackConfig(cfg,columns);
    expect(out.ok).toBe(false);
    expect(out.errors.join(' ')).toContain('nickname');
  });

  test('disabled rules never enter the write plan',()=>{
    const cfg=normalizeWriteBackConfig({
      enabled:true,
      rules:[
        {id:'version',enabled:true,source:'package_version',column:'nickname',strategy:'changed'},
        {id:'bundle',enabled:false,source:'bundle_id',column:'bundle_id',strategy:'always'}
      ]
    });
    const changes=buildWriteBackPlan({
      metadata:{package_version:'2.0',bundle_id:'com.example.demo'},
      current:{nickname:'1.0',bundle_id:''},
      config:cfg
    });
    expect(changes.map(x=>x.field)).toEqual(['package_version']);
    expect(changes[0].willWrite).toBe(true);
  });

  test('empty strategy only fills blank database values',()=>{
    const cfg=normalizeWriteBackConfig({
      enabled:true,
      rules:[{id:'bundle',enabled:true,source:'bundle_id',column:'bundle_id',strategy:'empty'}]
    });
    expect(buildWriteBackPlan({metadata:{bundle_id:'com.demo'},current:{bundle_id:''},config:cfg})[0].willWrite).toBe(true);
    expect(buildWriteBackPlan({metadata:{bundle_id:'com.demo'},current:{bundle_id:'manual.value'},config:cfg})[0].willWrite).toBe(false);
  });

  test('preview strategy shows the difference but never writes it',()=>{
    const cfg=normalizeWriteBackConfig({
      enabled:true,
      rules:[{id:'name',enabled:true,source:'package_name',column:'name',strategy:'preview'}]
    });
    const changes=buildWriteBackPlan({metadata:{package_name:'IPA Name'},current:{name:'Store Name'},config:cfg});
    expect(changes).toHaveLength(1);
    expect(changes[0].willWrite).toBe(false);
    expect(changes[0].strategy).toBe('preview');
  });

  test('unchanged values do not cause updates',()=>{
    const cfg=normalizeWriteBackConfig({
      enabled:true,
      rules:[
        {id:'version',enabled:true,source:'package_version',column:'nickname',strategy:'always'},
        {id:'size',enabled:true,source:'file_size',column:'bt2a',strategy:'changed'}
      ]
    });
    const changes=buildWriteBackPlan({
      metadata:{package_version:'1.2.3',file_size:'1048576'},
      current:{nickname:'1.2.3',bt2a:'1048576'},
      config:cfg
    });
    expect(changes).toEqual([]);
  });
});
