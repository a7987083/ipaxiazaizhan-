import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';

const app=createApp();
let agent, csrf, categoryId, sourceId, appId, versionId;

beforeAll(async()=>{
  await pool.query('TRUNCATE downloads,version_download_sources,screenshots,app_tags,tags,app_versions,apps,download_sources,categories,admins RESTART IDENTITY CASCADE');
  await pool.query("INSERT INTO categories(name,slug,sort_order) VALUES('工具','tools',100)");
  const hash=await bcrypt.hash('TestPassword123!',10);
  await pool.query("INSERT INTO admins(username,email,password_hash,role) VALUES('admin','admin@test.local',$1,'superadmin')",[hash]);
});
afterAll(async()=>pool.end());

describe('ZONOE API integration',()=>{
  test('health',async()=>{ const r=await request(app).get('/healthz'); expect(r.status).toBe(200); expect(r.body.ok).toBe(true); });
  test('admin unauthorized',async()=>{ const r=await request(app).get('/api/v1/admin/statistics'); expect(r.status).toBe(401); });
  test('admin login',async()=>{ agent=request.agent(app); const r=await agent.post('/api/v1/admin/login').send({username:'admin',password:'TestPassword123!'}); expect(r.status).toBe(200); csrf=r.body.data.csrfToken; expect(csrf).toBeTruthy(); });
  test('csrf blocks write',async()=>{ const r=await agent.post('/api/v1/admin/categories').send({name:'x',slug:'x'}); expect(r.status).toBe(403); });
  test('category CRUD',async()=>{ let r=await agent.post('/api/v1/admin/categories').set('x-csrf-token',csrf).send({name:'游戏',slug:'games',sortOrder:90}); expect(r.status).toBe(200); categoryId=r.body.data.id; r=await agent.put(`/api/v1/admin/categories/${categoryId}`).set('x-csrf-token',csrf).send({name:'游戏中心'}); expect(r.body.data.name).toBe('游戏中心'); });
  test('download source create',async()=>{ const r=await agent.post('/api/v1/admin/sources').set('x-csrf-token',csrf).send({name:'Local JP',type:'local',priority:10}); expect(r.status).toBe(200); sourceId=r.body.data.id; });
  test('app CRUD create and update',async()=>{ let r=await agent.post('/api/v1/admin/apps').set('x-csrf-token',csrf).send({name:'Test App',slug:'test-app',bundleId:'com.example.test',categoryId,status:'published',featured:true,shortDescription:'Integration test'}); expect(r.status).toBe(200); appId=r.body.data.id; r=await agent.put(`/api/v1/admin/apps/${appId}`).set('x-csrf-token',csrf).send({hot:true,developer:'ZONOE'}); expect(r.body.data.hot).toBe(true); });
  test('version create',async()=>{ const r=await agent.post(`/api/v1/admin/apps/${appId}/versions`).set('x-csrf-token',csrf).send({version:'1.0.0',build:'1',fileSize:123456,minIos:'15.0',sources:[{sourceId,target:'test.ipa',priority:10}]}); expect(r.status).toBe(200); versionId=r.body.data.id; });
  test('public search and pagination',async()=>{ const r=await request(app).get('/api/v1/apps?q=Test&page=1&pageSize=10'); expect(r.status).toBe(200); expect(r.body.data.length).toBe(1); expect(r.body.meta.total).toBe(1); });
  test('app detail and versions',async()=>{ let r=await request(app).get(`/api/v1/apps/${appId}`); expect(r.body.data.bundle_id).toBe('com.example.test'); r=await request(app).get(`/api/v1/apps/${appId}/versions`); expect(r.body.data[0].version).toBe('1.0.0'); });
  test('download returns 302 and increments statistics',async()=>{ const r=await request(app).get(`/download/${appId}`).redirects(0); expect(r.status).toBe(302); expect(r.headers.location).toBe('/files/test.ipa'); const s=await agent.get('/api/v1/admin/statistics'); expect(s.body.data.totalDownloads).toBe(1); });
  test('version update/delete',async()=>{ let r=await agent.put(`/api/v1/admin/versions/${versionId}`).set('x-csrf-token',csrf).send({changelog:'fixed'}); expect(r.body.data.changelog).toBe('fixed'); r=await agent.delete(`/api/v1/admin/versions/${versionId}`).set('x-csrf-token',csrf); expect(r.body.data.deleted).toBe(true); });
  test('source failure returns 503',async()=>{ const vr=await agent.post(`/api/v1/admin/apps/${appId}/versions`).set('x-csrf-token',csrf).send({version:'2.0.0',build:'2',sources:[]}); expect(vr.status).toBe(200); const r=await request(app).get(`/download/${appId}`).redirects(0); expect(r.status).toBe(503); expect(r.body.error.code).toBe('DOWNLOAD_SOURCE_UNAVAILABLE'); });
  test('app delete',async()=>{ const r=await agent.delete(`/api/v1/admin/apps/${appId}`).set('x-csrf-token',csrf); expect(r.body.data.deleted).toBe(true); const p=await request(app).get(`/api/v1/apps/${appId}`); expect(p.status).toBe(404); });
});
