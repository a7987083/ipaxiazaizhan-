import { describe,expect,test } from 'vitest';
import { buildWriteBackPlan,normalizeWriteBackConfig,validateWriteBackConfig } from '../src/services/ipaWriteBackService.js';

describe('IPA write-back mapping',()=>{
  const columns=[{name:'name'},{name:'nickname'},{name:'bundle_id'},{name:'bt2a'},{name:'min_ios'}];

  test('write-back defaults stay disabled',()=>{
    const cfg=normalizeWriteBackConfig({});
    expect(cfg.enabled).toBe(false);
    expect(cfg.autoApply).toBe(false);
    expect(Object.values(cfg.mappings).every(x=>x.enabled===false)).toBe(true);
  });

  test('duplicate target columns are rejected',()=>{
    const cfg=normalizeWriteBackConfig({
      enabled:true,
      mappings:{
        package_version:{enabled:true,column:'nickname',strategy:'changed'},
        package_build:{enabled:true,column:'nickname',strategy:'changed'}
      }
    });
    const out=validateWriteBackConfig(cfg,columns);
    expect(out.ok).toBe(false);
    expect(out.errors.join(' ')).toContain('nickname');
  });

  test('disabled fields never enter the write plan',()=>{
    const cfg=normalizeWriteBackConfig({
      enabled:true,
      mappings:{
        package_version:{enabled:true,column:'nickname',strategy:'changed'},
        bundle_id:{enabled:false,column:'bundle_id',strategy:'always'}
      }
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
      mappings:{bundle_id:{enabled:true,column:'bundle_id',strategy:'empty'}}
    });
    expect(buildWriteBackPlan({metadata:{bundle_id:'com.demo'},current:{bundle_id:''},config:cfg})[0].willWrite).toBe(true);
    expect(buildWriteBackPlan({metadata:{bundle_id:'com.demo'},current:{bundle_id:'manual.value'},config:cfg})[0].willWrite).toBe(false);
  });

  test('preview strategy shows the difference but never writes it',()=>{
    const cfg=normalizeWriteBackConfig({
      enabled:true,
      mappings:{package_name:{enabled:true,column:'name',strategy:'preview'}}
    });
    const changes=buildWriteBackPlan({metadata:{package_name:'IPA Name'},current:{name:'Store Name'},config:cfg});
    expect(changes).toHaveLength(1);
    expect(changes[0].willWrite).toBe(false);
    expect(changes[0].strategy).toBe('preview');
  });

  test('unchanged values do not cause updates',()=>{
    const cfg=normalizeWriteBackConfig({
      enabled:true,
      mappings:{
        package_version:{enabled:true,column:'nickname',strategy:'always'},
        file_size:{enabled:true,column:'bt2a',strategy:'changed'}
      }
    });
    const changes=buildWriteBackPlan({
      metadata:{package_version:'1.2.3',file_size:'1048576'},
      current:{nickname:'1.2.3',bt2a:'1048576'},
      config:cfg
    });
    expect(changes).toEqual([]);
  });
});
