import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const INSTALL_DIR = process.env.INSTALL_DIR || fileURLToPath(new URL('../../../../', import.meta.url));
const VERSION_FILE = process.env.VERSION_FILE || path.join(INSTALL_DIR, 'VERSION');
const RUNTIME_DIR = process.env.UPDATE_RUNTIME_DIR || path.join(INSTALL_DIR, 'data', 'update-runtime');
const STATUS_FILE = path.join(RUNTIME_DIR, 'admin-update-status.json');
const REQUEST_FILE = path.join(RUNTIME_DIR, 'admin-update-request.json');
const REPO = process.env.GITHUB_REPOSITORY || 'a7987083/ipaxiazaizhan-';
const PREVIEW_REF = process.env.GITHUB_PREVIEW_REF || 'feature/baota-native-deploy-v1';
const DEFAULT_CHANNEL = ['stable','preview'].includes(process.env.GITHUB_UPDATE_DEFAULT_CHANNEL) ? process.env.GITHUB_UPDATE_DEFAULT_CHANNEL : 'preview';

async function readText(file, fallback='') {
  try { return (await fs.readFile(file, 'utf8')).trim(); } catch { return fallback; }
}
async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
}
function githubHeaders() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'zonoe-admin-updater',
    'X-GitHub-Api-Version': '2022-11-28'
  };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}
async function githubJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), 10000);
  try {
    const res = await fetch(url, {headers:githubHeaders(), signal:controller.signal});
    if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
function compareVersion(currentVersion, latestVersion) {
  const comparable = /^\d+$/.test(currentVersion) && /^\d+$/.test(latestVersion);
  return {
    hasUpdate: comparable ? Number(latestVersion) > Number(currentVersion) : false,
    localAhead: comparable ? Number(currentVersion) > Number(latestVersion) : false
  };
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
async function fetchStable(currentVersion) {
  const release = await githubJson(`https://api.github.com/repos/${REPO}/releases/latest`);
  const latestVersion = versionFromRelease(release);
  if (!latestVersion) throw new Error('GitHub Stable Release 缺少可识别版本');
  return {
    id:'stable',
    label:'稳定版 Stable Release',
    source:'release',
    latestVersion,
    ...compareVersion(currentVersion,latestVersion),
    tag:release.tag_name || '',
    name:release.name || release.tag_name || '',
    notes:String(release.body || '').slice(0,8000),
    url:release.html_url || '',
    publishedAt:release.published_at || ''
  };
}
async function versionAtRef(ref) {
  const data = await githubJson(`https://api.github.com/repos/${REPO}/contents/VERSION?ref=${encodeURIComponent(ref)}`);
  if (data?.encoding !== 'base64' || !data?.content) throw new Error('Preview VERSION 无法读取');
  const version = Buffer.from(String(data.content).replace(/\s/g,''),'base64').toString('utf8').trim();
  if (!/^20\d{8,12}$/.test(version)) throw new Error('Preview VERSION 格式无效');
  return version;
}
async function fetchPreview(currentVersion) {
  const runs = await githubJson(`https://api.github.com/repos/${REPO}/actions/workflows/ci-release.yml/runs?branch=${encodeURIComponent(PREVIEW_REF)}&status=success&per_page=10`);
  const run = (runs?.workflow_runs || []).find(x=>x.conclusion==='success' && x.head_branch===PREVIEW_REF && /^[0-9a-f]{40}$/.test(String(x.head_sha||'')));
  if (!run) throw new Error('Preview 暂无通过 CI 的构建');
  const latestVersion = await versionAtRef(run.head_sha);
  return {
    id:'preview',
    label:'预览版 Preview',
    source:'branch-ci',
    branch:PREVIEW_REF,
    ref:run.head_sha,
    latestVersion,
    ...compareVersion(currentVersion,latestVersion),
    name:run.display_title || `Preview ${latestVersion}`,
    notes:`来自 ${PREVIEW_REF} 最近一次通过 CI 的构建。`,
    url:run.html_url || '',
    publishedAt:run.updated_at || run.created_at || '',
    workflowRunId:run.id
  };
}
async function channelInfo(channel,currentVersion) {
  try {
    return channel==='preview' ? await fetchPreview(currentVersion) : await fetchStable(currentVersion);
  } catch (e) {
    return {
      id:channel,
      label:channel==='preview'?'预览版 Preview':'稳定版 Stable Release',
      source:channel==='preview'?'branch-ci':'release',
      branch:channel==='preview'?PREVIEW_REF:undefined,
      latestVersion:'',
      hasUpdate:false,
      localAhead:false,
      error:e?.message || 'GitHub 检查失败'
    };
  }
}

export async function getOnlineUpdateStatus({checkRemote=true}={}) {
  await fs.mkdir(RUNTIME_DIR,{recursive:true});
  const currentVersion = await readText(VERSION_FILE,'unknown');
  const status = await readJson(STATUS_FILE,{state:'idle',message:'尚未执行后台更新'});
  let stable={id:'stable',label:'稳定版 Stable Release',latestVersion:'',hasUpdate:false,localAhead:false};
  let preview={id:'preview',label:'预览版 Preview',branch:PREVIEW_REF,latestVersion:'',hasUpdate:false,localAhead:false};
  if (checkRemote) [stable,preview] = await Promise.all([channelInfo('stable',currentVersion),channelInfo('preview',currentVersion)]);
  return {
    currentVersion,
    repository:REPO,
    defaultChannel:DEFAULT_CHANNEL,
    previewRef:PREVIEW_REF,
    channels:{stable,preview},
    status
  };
}

export async function queueOnlineUpdate({requestedBy='admin',channel='stable'}={}) {
  if (!['stable','preview'].includes(channel)) {
    const e=new Error('不支持的更新通道'); e.code='UPDATE_CHANNEL_INVALID'; throw e;
  }
  await fs.mkdir(RUNTIME_DIR,{recursive:true});
  const existing=await readJson(STATUS_FILE,null);
  if (existing?.state==='running' || existing?.state==='queued') {
    const e=new Error('已有在线更新任务正在执行'); e.code='UPDATE_BUSY'; throw e;
  }
  try {
    await fs.access(REQUEST_FILE);
    const e=new Error('已有在线更新请求等待执行'); e.code='UPDATE_BUSY'; throw e;
  } catch (e) {
    if (e?.code!=='ENOENT') throw e;
  }

  const currentVersion=await readText(VERSION_FILE,'unknown');
  const target=await channelInfo(channel,currentVersion);
  if (target.error) {
    const e=new Error(target.error); e.code='UPDATE_CHECK_FAILED'; throw e;
  }
  if (!target.hasUpdate) {
    const e=new Error(target.localAhead?'当前版本高于所选通道，禁止降级':'所选通道没有更高版本可更新');
    e.code='UPDATE_NOT_AVAILABLE'; throw e;
  }

  const now=new Date().toISOString();
  const queued={
    state:'queued',
    message:`已提交 ${target.label} 更新任务，等待系统更新服务执行`,
    channel,
    targetVersion:target.latestVersion,
    requestedAt:now,
    requestedBy
  };
  await fs.writeFile(STATUS_FILE,JSON.stringify(queued,null,2)+'\n',{mode:0o640});
  try {
    // Web API only chooses one of two fixed channels. It never accepts arbitrary refs
    // and never sets force=true, so the privileged worker remains forward-only.
    const request={channel,force:false,targetVersion:target.latestVersion,requestedBy,requestedAt:now};
    if (channel==='preview') request.ref=target.ref;
    await fs.writeFile(REQUEST_FILE,JSON.stringify(request,null,2)+'\n',{flag:'wx',mode:0o600});
  } catch (e) {
    await fs.writeFile(STATUS_FILE,JSON.stringify({state:'failed',message:'无法提交更新任务',finishedAt:new Date().toISOString()},null,2)+'\n',{mode:0o640}).catch(()=>{});
    throw e;
  }
  return queued;
}
