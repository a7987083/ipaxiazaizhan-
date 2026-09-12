# HANDOFF

## Current Project Pointer

- Repository: `a7987083/ipaxiazaizhan-`
- Branch: `feature/baota-native-deploy-v1`
- Version: `2026091206`
- Head Commit: `3affd73f34b8c362db843bd3a2ce88f0263ad777`
- Commit message: `fix: harden login navigation and add route smoke v2026091206`
- Workflow: `.github/workflows/ci-release.yml`
- Actions Run: `34710236163`
- CI Result: `success`
- CI Artifact: `zonoe-ipa-download-2026091206-baota-native-build`
- Artifact ID: `10303390781`
- Native ZIP: `zonoe-ipa-download-2026091206-baota-native.zip`
- Native ZIP SHA256: `8ce7508929695647327e4672d151c3ddbd3b5214c769264091d274e880e908d5`
- Current Phase: `Phase 1.2 — BaoTa Native Deployment & Docker Exit`
- Real BaoTa runtime: verified
- Clean fresh install from latest ZIP: not yet verified without manual PostgreSQL HBA adjustment

## Current Architecture

```text
Browser
  ↓ HTTPS
BaoTa Nginx
  ├─ /, /assets/*, /files/* -> <site>/public
  ├─ /api/*                 -> 127.0.0.1:3000
  ├─ /download/*            -> 127.0.0.1:3000
  └─ /healthz               -> 127.0.0.1:3000

systemd: zonoe-api
  ↓
Node.js 22 + Express
  ↓
Local PostgreSQL
```

Default BaoTa deployment no longer needs Docker. Docker files remain only for compatibility/migration and are excluded from the Native BaoTa ZIP.

## Real Production Verification Completed

On the real BaoTa host the following were observed working:

- `zonoe-api.service` active/running.
- Node API listening on `127.0.0.1:3000`.
- local `/healthz` returns success.
- local `/api/v1/home` returns settings/categories from PostgreSQL.
- public HTTPS homepage returns 200.
- public `/healthz` works through BaoTa Nginx.
- public `/api/v1/home` works through BaoTa Nginx.
- actual hashed JS asset returns 200 with immutable cache headers.
- PostgreSQL migration and seed complete successfully.
- `/login` works in the browser after the `2026091206` frontend hotfix.

This is enough to mark the **running production architecture** as verified. It is not yet enough to claim that a completely fresh latest ZIP install is zero-touch, because the real host required a manual HBA compatibility step during installation.

## Real-Host Issues Found During Verification

### 1. psql password variable expansion

Old installer SQL used a form that produced:

```text
syntax error at or near ":"
ALTER ROLE "zonoe" WITH LOGIN PASSWORD :'dbpass';
```

Fixed by executing psql variable substitution through standard input.

### 2. BaoTa protected `public/.user.ini`

BaoTa had immutable protection on `public/.user.ini`, so deleting all of `public/` failed even as root.

Installer now synchronizes `apps/web/dist/` with `rsync` and preserves `.user.ini` / `.well-known` instead of deleting the entire Web Root.

### 3. Unused pgcrypto dependency

`001_init.sql` contained `CREATE EXTENSION IF NOT EXISTS pgcrypto;`, but the schema did not use pgcrypto functions. BaoTa PostgreSQL did not ship `pgcrypto.control` at the expected path.

The unused extension dependency has been removed.

### 4. PostgreSQL ident authentication

The real host's `pg_hba.conf` matched local TCP connections with `ident`, so Node password authentication failed even after the role password was correctly set.

The production host was fixed with application-specific local rules for the `zonoe` database/user and PostgreSQL config reload.

**Important:** this remediation is still manual in the current installer. Before calling the ZIP zero-touch, add narrow HBA compatibility handling to `install.sh` and test on a clean BaoTa host.

### 5. `/login` runtime crash

The public site and API worked, but `/login` hit the frontend FatalBoundary with `l is not a function`.

`2026091206` removes `useNavigate()` from Login/Admin navigation paths and uses `window.location.assign()` instead. CI now includes route smoke coverage, and the real browser retest passed.

## Critical Behavior Not To Break

1. IPA large files must not be proxied through Node.
2. `/download/{appId}` must record statistics and then redirect.
3. Download Source remains adapter-based.
4. Mobile admin remains usable.
5. `.env`, `data/uploads`, and `backups` must survive update/migration.
6. Before Docker -> Native migration, export the database and never auto-delete old Docker volumes.
7. Native API must listen only on localhost.
8. BaoTa site Web Root must be `<site>/public`.
9. Preserve BaoTa-managed `.user.ini` / `.well-known` when deploying frontend assets.
10. Real runtime verification does not replace clean-install/update/migration verification.

## Remaining Risks / Work

- P0: automate the PostgreSQL HBA compatibility step in `install.sh`.
- P0: run one completely clean Native ZIP install without manual edits.
- P0: verify Docker -> Native migration using real old data.
- P0: publish a new Stable Release only after those deployment tests.
- P1: run online update E2E and rollback/backup verification.
- P2: `/healthz` still reports hard-coded `2026091201`; change it to read `VERSION`.
- P2: Docker compatibility files remain in the repository by design.

## Current Server

The currently running real site is functioning. Do not reinstall it merely to make documentation match the repository.

If inspecting the existing host:

```bash
systemctl status zonoe-api --no-pager
journalctl -u zonoe-api -n 100 --no-pager
curl -fsS http://127.0.0.1:3000/healthz
curl -fsS http://127.0.0.1:3000/api/v1/home
```

Do not expose `.env` or `data/install-info.txt` contents publicly because they contain credentials/secrets.

## Next Task

1. Add safe app-specific `pg_hba.conf` compatibility handling to installer.
2. Produce next Native build and perform one clean empty-site install.
3. Verify real Docker -> Native migration and preserved uploads/data.
4. Publish new Stable Release.
5. Run old Stable -> new Stable `update.sh` E2E and rollback test.

## Files To Read First When Taking Over

1. `PROJECT_STATE.json`
2. `ROADMAP.md`
3. `KNOWN_ISSUES.md`
4. `CHANGELOG_DEV.md`
5. `DEPLOY.md`
6. `install.sh`
7. `nginx.rewrite`
8. `scripts/lib-deploy.sh`
9. `scripts/backup.sh`
10. `.github/workflows/ci-release.yml`
