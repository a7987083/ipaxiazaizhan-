import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const INSTALL_DIR = process.env.INSTALL_DIR || fileURLToPath(new URL('../../../../', import.meta.url));
const VERSION_FILE = process.env.VERSION_FILE || path.join(INSTALL_DIR, 'VERSION');
const RUNTIME_DIR = process.env.UPDATE_RUNTIME_DIR || path.join(INSTALL_DIR, 'data', 'update-runtime');
const STATUS_FILE = path.join(RUNTIME_DIR, 'admin-update-status.json');
const REQUEST_FILE = path.join(RUNTIME_DIR, 'admin-update-request.json');
const REPO = process.env.GITHUB_REPOSITORY || 'a7987083/ipaxiazaizhan-';
const CHANNEL = process.env.GITHUB_RELEASE_CHANNEL || 'stable';

async function readText(file, fallback='') {
  try { return (await fs.readFile(file, 'utf8')).trim(); } catch { return fallback; }
}
async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
}
function versionFromRelease(release) {
  const candidates = [];
  for (const asset of release?.assets || []) {
    const m = /^zonoe-ipa-download-(20\d{8,12})-baota-native\.zip$/.exec(asset.name || '');
    if (m) {
      const shaName = `${asset.name}.sha256`;
      if ((release.assets || []).some(x => x.name === shaName)) candidates.push(m[1]);
    }
  }
  if (candidates.length) return candidates.sort((a,b)=>Number(b)-Number(a))[0];
  const m = /(20\d{8,12})/.exec(String(release?.tag_name || ''));
  return m?.[1] || '';
}
async function fetchRelease() {
  const endpoint = CHANNEL === 'stable'
    ? `https://api.github.com/repos/${REPO}/releases/latest`
    : `https://api.github.com/repos/${REPO}/releases/tags/${encodeURIComponent(CHANNEL)}`;
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'zonoe-admin-updater',
    'X-GitHub-Api-Version': '2022-11-28'
  };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), 10000);
  try {
    const res = await fetch(endpoint, {headers, signal:controller.signal});
    if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`);
    const release = await res.json();
    const latestVersion = versionFromRelease(release);
    if (!latestVersion) throw new Error('GitHub Release 缺少可识别版本');
    return {
      latestVersion,
      tag: release.tag_name || '',
      name: release.name || release.tag_name || '',
      notes: String(release.body || '').slice(0, 8000),
      url: release.html_url || '',
      publishedAt: release.published_at || ''
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function getOnlineUpdateStatus({checkRemote=true}={}) {
  await fs.mkdir(RUNTIME_DIR, {recursive:true});
  const currentVersion = await readText(VERSION_FILE, 'unknown');
  const status = await readJson(STATUS_FILE, {state:'idle', message:'尚未执行后台更新'});
  let release = null, remoteError = '';
  if (checkRemote) {
    try { release = await fetchRelease(); }
    catch (e) { remoteError = e?.message || 'GitHub 检查失败'; }
  }
  const latestVersion = release?.latestVersion || '';
  const comparable = /^\d+$/.test(currentVersion) && /^\d+$/.test(latestVersion);
  return {
    currentVersion,
    latestVersion,
    hasUpdate: comparable ? Number(latestVersion) > Number(currentVersion) : false,
    localAhead: comparable ? Number(currentVersion) > Number(latestVersion) : false,
    repository: REPO,
    channel: CHANNEL,
    release,
    remoteError,
    status
  };
}

export async function queueOnlineUpdate({requestedBy='admin'}={}) {
  await fs.mkdir(RUNTIME_DIR, {recursive:true});
  const existing = await readJson(STATUS_FILE, null);
  if (existing?.state === 'running' || existing?.state === 'queued') {
    const e = new Error('已有在线更新任务正在执行');
    e.code = 'UPDATE_BUSY';
    throw e;
  }
  try {
    await fs.access(REQUEST_FILE);
    const e = new Error('已有在线更新请求等待执行');
    e.code = 'UPDATE_BUSY';
    throw e;
  } catch (e) {
    if (e?.code !== 'ENOENT') throw e;
  }

  const now = new Date().toISOString();
  const queued = {state:'queued', message:'更新任务已提交，等待系统更新服务执行', requestedAt:now, requestedBy};
  await fs.writeFile(STATUS_FILE, JSON.stringify(queued, null, 2)+'\n', {mode:0o640});
  try {
    // Admin-triggered updates are deliberately forward-only. The privileged worker
    // never receives force=true from the web API, which prevents accidental downgrade
    // when a development build is newer than the published Stable release.
    await fs.writeFile(REQUEST_FILE, JSON.stringify({force:false, requestedBy, requestedAt:now}, null, 2)+'\n', {flag:'wx', mode:0o600});
  } catch (e) {
    await fs.writeFile(STATUS_FILE, JSON.stringify({state:'failed',message:'无法提交更新任务',finishedAt:new Date().toISOString()},null,2)+'\n', {mode:0o640}).catch(()=>{});
    throw e;
  }
  return queued;
}
