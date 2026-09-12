# Changelog

## 2026091201 - Phase 1 Production Foundation

- 完成 Mobile First IPA 下载站前台：首页、列表、搜索、排序、详情、截图、历史版本。
- 完成手机/桌面响应式管理后台。
- 完成 App / Version / Category / Tag / Download Source / Settings / Statistics API。
- 完成 Storage Adapter 与 Download Service，支持 Local/HTTP/OpenList/Cloud/CDN/S3/OSS/R2/Other。
- 下载统一记录统计后 302，不由应用进程代理 IPA 数据。
- PostgreSQL Migration、Admin seed、JWT+CSRF、rate limit、IPA ZIP magic 验证。
- Docker Compose、Nginx、在线安装更新、本地部署包、SHA256、备份与自动回滚。
