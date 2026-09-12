# Changelog

## 2026091202 - Frontend Boot Reliability

- Docker Web/API 构建改用仓库根 `package-lock.json` + `npm ci`，部署与 CI 使用同一锁定依赖。
- Web 启动页加入可见启动占位与静态资源失败提示，避免前端资源异常时只显示纯白页。
- React 顶层加入 Fatal Error Boundary，运行时渲染异常会显示错误信息。
- Smoke Test 增加首页 HTML 与构建后 JS Asset 可达性检查。
- 版本升级为 `2026091202`。

## 2026091201 - Phase 1 Production Foundation

- 完成 Mobile First IPA 下载站前台：首页、列表、搜索、排序、详情、截图、历史版本。
- 完成手机/桌面响应式管理后台。
- 完成 App / Version / Category / Tag / Download Source / Settings / Statistics API。
- 完成 Storage Adapter 与 Download Service，支持 Local/HTTP/OpenList/Cloud/CDN/S3/OSS/R2/Other。
- 下载统一记录统计后 302，不由应用进程代理 IPA 数据。
- PostgreSQL Migration、Admin seed、JWT+CSRF、rate limit、IPA ZIP magic 验证。
- Docker Compose、Nginx、在线安装更新、本地部署包、SHA256、备份与自动回滚。
