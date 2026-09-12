# Architecture

## 技术选型

- Frontend: React + Vite。组件化、移动端适配简单，构建结果为纯静态资源。
- Backend: Node.js 22 + Express 5。部署成熟，下载调度只做 metadata/302，不承担 IPA 数据流。
- Database: PostgreSQL 16。适合多版本、多来源、统计和后续搜索扩展。
- Cache: Redis 7 可选。首版 API 不依赖 Redis 才能正确运行，后续用于排行榜、限流和缓存。
- Web Server: Nginx。TLS、静态前端、本地 IPA `sendfile`、反向代理统一入口。
- Deployment: Docker Compose。保持单机部署简单，未来可拆 PostgreSQL/Redis/API 实例横向扩展。

## 请求路径

```text
Browser -> Nginx -> React static
               -> /api/v1 -> API -> PostgreSQL
               -> /download -> DownloadService -> 302 -> OpenList/Tianyi/CDN
               -> /files -> Nginx local sendfile
```

## Download Service

`version_download_sources` 绑定 AppVersion 与 DownloadSource，按 binding priority、source priority 顺序解析。业务层不保存 OpenList/Tianyi 特有逻辑。

Adapters:
- local: `target` 为 `data/uploads` 下相对路径，响应 `/files/...`。
- http/cloud/cdn/s3/oss/r2/other: 绝对 URL 或 `base_url + target`。
- openlist: 默认 `base_url + /d/{path}`，可在加密 config 中配置 `pathTemplate` 和 query 参数。

下载源全部失效时返回 HTTP 503，不生成假跳转。
