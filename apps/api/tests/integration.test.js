import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import request from 'supertest';
import fs from 'node:fs/promises';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { ensureControlInitialized } from '../src/storage/controlStore.js';

const app=createApp();
let agent,csrf;
const sourceA={name:'源 A',slug:'source-a',host:'127.0.0.1',port:3306,database:'source_a',username:'reader',password:'secret-a',table:'fa_category',priority:10,enabled:true};
const sourceB={name:'源 B',slug:'source-b',host:'127.0.0.1',port:3306,database:'source_b',username:'reader',password:'secret-b',table:'fa_category',priority:20,enabled:true};

beforeAll(async()=>{await fs.rm(env.CONTROL_DIR,{recursive:true,force:true});await ensureControlInitialized()});
afterAll(async()=>{});

describe('ZONOE 1208 MySQL source aggregation',()=>{
  test('health',async()=>{const r=await request(app).get('/healthz');expect(r.status).toBe(200);expect(r.body.ok).toBe(true)});
  test('admin unauthorized',async()=>{const r=await request(app).get('/api/v1/admin/statistics');expect(r.status).toBe(401)});
  test('admin login',async()=>{agent=request.agent(app);const r=await agent.post('/api/v1/admin/login').send({username:'admin',password:'TestPassword123!'});expect(r.status).toBe(200);csrf=r.body.data.csrfToken;expect(csrf).toBeTruthy()});
  test('csrf blocks write',async()=>{const r=await agent.post('/api/v1/admin/sources').send(sourceA);expect(r.status).toBe(403)});
  test('add two MySQL software sources with duplicate legacy ids',async()=>{let r=await agent.post('/api/v1/admin/sources').set('x-csrf-token',csrf).send(sourceA);expect(r.status).toBe(200);expect(r.body.data.password).toBeUndefined();r=await agent.post('/api/v1/admin/sources').set('x-csrf-token',csrf).send(sourceB);expect(r.status).toBe(200);const list=await agent.get('/api/v1/admin/sources');expect(list.body.data).toHaveLength(2);expect(list.body.data[0].database).toBe('source_a')});
  test('source connection test',async()=>{const r=await agent.post('/api/v1/admin/sources/1/test').set('x-csrf-token',csrf).send({});expect(r.status).toBe(200);expect(r.body.data.connected).toBe(true)});
  test('public aggregation keeps source+id identity',async()=>{const r=await request(app).get('/api/v1/apps?pageSize=20');expect(r.status).toBe(200);expect(r.body.meta.total).toBe(4);const ids=r.body.data.map(x=>x.id);expect(ids).toContain('source-a:1');expect(ids).toContain('source-b:1');expect(new Set(ids).size).toBe(4)});
  test('cross-source search and source filter',async()=>{let r=await request(app).get('/api/v1/apps?q=Beta');expect(r.body.meta.total).toBe(1);expect(r.body.data[0].source_slug).toBe('source-b');r=await request(app).get('/api/v1/apps?category=source-a');expect(r.body.meta.total).toBe(2);expect(r.body.data.every(x=>x.source_slug==='source-a')).toBe(true)});
  test('detail and versions read legacy fa_category mapping',async()=>{let r=await request(app).get('/api/v1/apps/source-a:1');expect(r.status).toBe(200);expect(r.body.data.name).toBe('Alpha Game');expect(r.body.data.version).toBe('100');expect(r.body.data.file_size).toBe(104857600);r=await request(app).get('/api/v1/apps/source-a:1/versions');expect(r.body.data[0].version).toBe('100')});
  test('download redirects to original IPA without copy',async()=>{const r=await request(app).get('/download/source-a:1').redirects(0);expect(r.status).toBe(302);expect(r.headers.location).toBe('https://cdn.example/a.ipa')});
  test('application writes and duplicate upload are disabled',async()=>{let r=await agent.post('/api/v1/admin/apps').set('x-csrf-token',csrf).send({name:'x'});expect(r.status).toBe(405);r=await agent.post('/api/v1/admin/upload').set('x-csrf-token',csrf);expect(r.status).toBe(405)});
  test('change password invalidates old session and accepts new password',async()=>{let r=await agent.post('/api/v1/admin/account/password').set('x-csrf-token',csrf).send({currentPassword:'TestPassword123!',newPassword:'NewPassword456!',confirmPassword:'NewPassword456!'});expect(r.status).toBe(200);r=await agent.get('/api/v1/admin/statistics');expect(r.status).toBe(401);const fresh=request.agent(app);r=await fresh.post('/api/v1/admin/login').send({username:'admin',password:'NewPassword456!'});expect(r.status).toBe(200)});
  test('login rate-limit is JSON',async()=>{for(let i=0;i<20;i++)await request(app).post('/api/v1/admin/login').send({username:'admin',password:'wrong-password'});const r=await request(app).post('/api/v1/admin/login').send({username:'admin',password:'wrong-password'});expect(r.status).toBe(429);expect(r.body.error.code).toBe('LOGIN_RATE_LIMITED');expect(r.body.error.message).toMatch(/登录尝试过多/)});
});
