# Handoff

- Repo: `a7987083/ipaxiazaizhan-`
- Branch: `feature/baota-native-deploy-v1`
- Candidate: `2026091223`
- Hotfix code commit: `34d22fd1d5ae13a3f4c061e9b1d59c0d843179dc`
- Regression test commit: `09c3cf2df006f6cf9633d52fd4424adfae6be329`
- Baseline: `2026091222` / `200d4944574d5b7ebcceb9d71c184dc5cf96b42f`
- GitHub Actions: #74 / run `34782998703` passed for all executed validation/package steps.
- Real BaoTa verification for 2026091223: pending.

## What 1223 fixes

1. The write-back Preview no longer hides Apps whose mapped database values already match the parsed IPA metadata.
2. If Preview scans 50 Apps and there are 0 writable changes, all 50 scanned Apps remain visible instead of showing an empty table.
3. Unchanged rows explicitly say that the mapped fields match the IPA metadata and no write is required.
4. Preview can be filtered by: all scanned Apps / Apps with any field difference / Apps with writable changes.
5. A contract test protects this UI behavior from regression.
6. MySQL write-back rules, mapping semantics, scheduler behavior and IPA parsing are unchanged from 2026091222.

## Controlled write-back behavior inherited from 1222

- Site settings use a Chinese multi-field form.
- Local Cache management can inspect/clear local OpenList directory and IPA metadata caches without touching remote IPA or MySQL data.
- Data Sync is configured independently for each MySQL source.
- Every parsed field has an independent enable switch, target DB column and strategy.
- Source write-back and automatic write-back both default OFF.
- Only current successful IPA parses with exact `md5 === parsedMd5` qualify for DB write-back.
- Existing rows can be updated; automatic INSERT of brand-new Apps is still disabled.
- Manual preview/apply and write-back history are available.

## CI verification

Actions #74 passed:
- Integration tests
- Production build
- Native API smoke
- Native frontend static smoke
- Shell validation
- BaoTa native contract
- MySQL multi-source contract
- GitHub updater contract
- deployment package build / validation / artifact upload

`release-e2e` remains skipped by the existing workflow condition. This means 2026091223 is **CI/package verified, not yet real BaoTa/MySQL-writeback verified**.

## Recommended real deployment validation

Update the existing BaoTa instance to 2026091223 and run “预览前 50 个已解析 App” again. First confirm that scanned Apps are visible even when there are no differences. Keep source write-back disabled while checking the field mapping and old/new values. Only after the preview is correct should one low-risk field be enabled for a manual write-back test on one or a few existing Apps.
