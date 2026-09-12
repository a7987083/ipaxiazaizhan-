# ROADMAP

## 当前阶段

- 阶段：Phase 1.1 — 宝塔部署加固与生产验证
- 版本：`2026091201`
- Branch：`feature/baota-oneclick-deploy-v1`
- 实现基线 Commit：`e9bb144a045bc51efbe74fa19f85f412878f09b0`
- CI：GitHub Actions Run `34689591609`，结果 `success`
- 当前状态：CI 已通过，生产环境真实访问验证尚未完成；已有一次部署后空白页反馈。

## 阶段目标

把 Phase 1 已完成的 IPA 下载站从“代码与 CI 可用”推进到“宝塔环境可稳定安装、打开、登录、访问 API、更新与回滚”的生产可部署状态。

## 本阶段范围

### In Scope

1. 宝塔一键部署包结构、`auto_install.json`、`install.sh`、`nginx.rewrite`。
2. Docker 内部 Nginx 与宝塔公网 Nginx 的端口/反代边界。
3. React 静态资源、SPA 路由、`/api/v1`、`/download`、`/files` 的真实域名访问。
4. PostgreSQL / Redis / API / Web / Nginx 容器启动与健康检查。
5. GitHub Actions 构建、Artifact、Stable Release 与在线更新链路。
6. 首次安装、管理员 Seed、HTTPS 切换、更新前备份与失败回滚。
7. 生产 Smoke Test 和部署文档闭环。

### Out of Scope

1. 自动热门 IPA 镜像策略。
2. 大规模搜索/推荐算法。
3. 多机横向扩展。
4. 新 UI 大改版。
5. 在当前部署问题解决前增加新的业务功能。

## 计划与状态

| 项目 | 状态 | 说明 |
| --- | --- | --- |
| Phase 1 前后端/数据库/下载调度 | Done | 已实现并进入当前分支基线 |
| 宝塔一键部署脚本 | Done | 已加入 `install.sh`、`auto_install.json`、`nginx.rewrite` |
| 内部端口隔离 | Done | Docker Nginx 设计为 `127.0.0.1:18081` |
| CI 构建与部署包 | Done | Run `34689591609` 成功并生成 Artifact |
| 宝塔真实环境首次安装 | In Progress | 用户反馈部署后页面空白，需复现/定位 |
| 静态资源与 API 域名 Smoke | Pending | 需检查 `/assets/*`、`/healthz`、`/api/v1/home` |
| 新 Stable Release | Pending | 当前公开 Release 仍落后于宝塔修复分支 |
| 在线更新 E2E | Pending | 新 Release 发布后验证 |
| HTTPS / Cookie 安全配置 | Pending | HTTP 首装稳定后验证 |

## 阶段完成标准

满足以下条件后 Phase 1.1 才可标记 Done：

- 宝塔全新环境上传部署包后无需手工改源码即可打开首页。
- 首页 JS/CSS 静态资源返回 200，无浏览器致命运行时错误。
- `/healthz`、`/api/v1/home` 正常。
- `/admin` 可登录并完成至少一次基础配置读取。
- Docker 重启后服务恢复正常。
- 新 Stable Release 指向已验证 Commit，而不是旧基线。
- `update.sh` 从旧安装升级到新 Release 成功，保留 `.env`、`data`、`backups`。
- 失败场景可触发回滚或给出明确错误。

## Next Task

**优先级 P0：完成宝塔真实域名白屏定位，并基于已通过 CI 的 Artifact 做一次干净安装验证。**

建议顺序：

1. 在目标服务器执行 `docker compose ps`。
2. 检查 `curl -I http://127.0.0.1:18081/` 和 `curl http://127.0.0.1:18081/healthz`。
3. 检查宝塔站点 Nginx 是否实际加载 `proxy_pass http://127.0.0.1:18081;`。
4. 浏览器检查首页 HTML 引用的 `/assets/*.js`、`/assets/*.css` 是否 200。
5. 检查 `/api/v1/home` 响应。
6. 修复后重新跑 CI，提升 `VERSION`，发布新的 Stable Release。
7. 用新 Release 做一次全新安装 + 一次在线升级 E2E。
