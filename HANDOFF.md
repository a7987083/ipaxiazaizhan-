# HANDOFF

- Repository: `a7987083/ipaxiazaizhan-`
- Branch: `work/zonoe-download-v1`
- Version: `2026091201`
- Stable baseline: initial repository commit `d5bb60cd119aac9b6166892ffb8cc3427289b18a`
- Current goal: Phase 1 production-ready IPA download site.
- UI baseline: user-confirmed ZONOE blue/white App Store style; Mobile First + complete PC layout.
- Storage baseline: existing OpenList + Tianyi Cloud 302 remains valid; Japanese VPS can be added as high-priority Local source for hot IPA mirrors.
- Deployment baseline reference: `a7987083/app-` Phase13 GitHub release/update design; this project implements online Release install/update + local deployment package with shared deployment core.

## Critical behavior not to break

1. IPA bulk download must not be proxied through Node.js.
2. `/download/{appId}` must record statistics then return 302.
3. Download Source must remain adapter-based; do not hardcode Tianyi/OpenList into App business tables.
4. Mobile admin must remain fully usable without PC.
5. `.env`, `data/uploads` and `backups` must survive online updates.
6. Failed updates must attempt rollback.

## Build / Test

- `npm install`
- `npm run migrate -w apps/api`
- `npm test`
- `npm run build`
- `docker compose config`
- `docker compose build api web`
- `./scripts/build-release.sh dist-release`

## Next Task

1. Run GitHub Actions until CI is green.
2. Fix only first real CI/build/test errors.
3. Publish first tagged Release and verify online update E2E on a disposable VPS.
4. Configure real OpenList source (`base_url`, `/d/{path}` targets) and validate Tianyi 302.
5. Add automatic hot-mirror policy only after real download data exists.
