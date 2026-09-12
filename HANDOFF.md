# HANDOFF

## Current Project Pointer

- Repository: `a7987083/ipaxiazaizhan-`
- Branch: `feature/baota-native-deploy-v1`
- Candidate Version: `2026091207`
- Implementation Commit: `7f20a61bb51e96c5f14ecad26dfa4677d9154478`
- CI Run: `34716750221` — `success`
- Artifact: `zonoe-ipa-download-2026091207-baota-native-build`
- Artifact ID: `10305265521`
- Native ZIP: `zonoe-ipa-download-2026091207-baota-native.zip`
- ZIP SHA256: `29f04695938a91160e4168e30d2461d0fb72e7d5cd0f1ee94c674bc1be10c8dd`
- Production runtime verified baseline: `2026091206`
- Current phase: `Phase 1.3 — BaoTa Native Installer Hardening & GitHub Online Update`

## Architecture

```text
Browser
  ↓
BaoTa Nginx
  ├─ /, /assets/*, /files/* -> <site>/public
  ├─ /api/*                 -> 127.0.0.1:3000
  └─ /download/*            -> 127.0.0.1:3000

systemd: zonoe-api
  ↓
Node.js 22 + Express
  ↓
Local PostgreSQL
```

Docker remains compatibility/migration-only source code and is excluded from the BaoTa Native ZIP.

## What 1207 Adds

### PostgreSQL HBA self-healing

`install.sh` now validates the app's actual TCP password connection. If BaoTa PostgreSQL rejects it with `ident` or another earlier host rule:

1. Locate the active HBA file using `SHOW hba_file`.
2. Back it up under project `backups/`.
3. Prepend a managed block only for the configured ZONOE DB/user on localhost.
4. Reload PostgreSQL.
5. Retry password authentication and fail closed if it still does not work.

Do not broaden HBA to all databases/users.

### BaoTa protected files

Never delete the whole `public/` directory. Both install and update preserve:

- `public/.user.ini`
- `public/.well-known/`
- `public/files` runtime link

### GitHub online updater

Production:

```bash
cd /www/wwwroot/<site>
bash update.sh
```

Check only:

```bash
bash update.sh --check
```

Specific release:

```bash
bash update.sh --tag download-v2026091207
```

Preview branch/ref:

```bash
bash update.sh --branch feature/baota-native-deploy-v1
```

Stable/tag mode requires SHA256 validation. The updater backs up current source, `.env`, frontend and DB before staging the new version. Logs:

- `data/update.log`
- `data/update-history.log`

### Health endpoint

`/healthz` now reads the root `VERSION` file. CI asserts the returned version exactly matches the build candidate.

## Critical Behavior Not To Break

1. IPA large files must not be proxied through Node.
2. `/download/{appId}` must record statistics before redirect.
3. `.env`, `data/uploads`, `backups` must survive update/migration.
4. Native API stays on `127.0.0.1:3000`.
5. BaoTa web root stays `<site>/public`.
6. Never recursively remove BaoTa's protected `public/.user.ini`.
7. PostgreSQL HBA automation must remain narrowly scoped to the app DB/user + localhost.
8. Stable online update must verify SHA256 before deployment.
9. Old Docker volumes are never auto-deleted during migration.

## Verification Status

Passed in 1207 CI:

- migrations / integration tests
- production build
- Native API smoke
- healthz version match
- frontend static smoke
- login/admin navigation source checks
- shell validation
- BaoTa installer contract
- GitHub updater contract
- package validation
- native ZIP SHA256/integrity

Still requires real host verification:

- 1207 clean install without manual HBA edit
- 1206 -> 1207 GitHub online update E2E
- failed-update rollback E2E
- Docker -> Native real-data migration

## Stable Release Rule

Do not publish 1207 Stable merely because CI is green. Promote only after clean-install + online-update E2E on BaoTa. Current public Stable remains behind this candidate.

## Files To Read First

1. `PROJECT_STATE.json`
2. `ROADMAP.md`
3. `KNOWN_ISSUES.md`
4. `CHANGELOG_DEV.md`
5. `install.sh`
6. `update.sh`
7. `install-online.sh`
8. `scripts/lib-deploy.sh`
9. `.github/workflows/ci-release.yml`
