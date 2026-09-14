# Handoff

- Repo: `a7987083/ipaxiazaizhan-`
- Branch: `feature/baota-native-deploy-v1`
- Candidate: `2026091230`
- Baseline: `2026091229` / `f0494e2a57108abe99fcd8dd45e01d9b8715b8cb`
- Replica preview cache fix: `d6057508b4e8c7bc5dd2eabf3e5743ae00264ef3`
- Configurable scheduler fix: `0c09e9be12f6ce3606cc523ca5bbb0929f36df51`
- Range UI fix: `4e9fc191582fcf369b786bef1729ea56acc6d9d5`
- Final hotfix CI: Actions #150 / run `34847017796` passed validation and package jobs.
- Real BaoTa/OpenList 1230 recheck: pending.

## Why 1230 exists

Real 1229 runtime testing exposed three concrete regressions/defects:

1. The Range Parser summary showed `NaN` for “本小时 / 今日 / 今日真实读取” even though the backend counters and remaining quota were numeric. Root cause: the shared numeric `Card` component always calls `Number(v)`, but the Range panel passed formatted strings such as `4/10` and `0.5 MB`. 1230 uses a text-preserving stat card for formatted Range values.
2. The scheduler UI looked configurable, but `effectiveSchedule()` hard-clamped runtime execution to at least 15 minutes and exactly 1 IPA per run. 1230 removes that hidden hard-fix: saved values in the existing supported range `5..1440 minutes` and `1..20 IPA/run` are honored. The rolling 10/hour and 150/day Range budgets remain authoritative and parsing remains sequential.
3. The 1229 replica reconciliation result appeared to have lost caching/persistence. Root cause: `replicaPreviewStore.normalize()` wrote schema v2 data but dropped `replicaSchemaVersion`; after re-reading the JSON, `previewCompatible()` always rejected the saved preview. 1230 persists `replicaSchemaVersion`, restoring page-navigation/server-reload reconciliation cache behavior.

## 1229 functionality preserved

Replica integrity states (`verified`, `missing`, `md5_mismatch`, `size_mismatch`, `unverified`), source-priority sync planning, `source -> target` preview, stale-plan SHA-256 protection, target-specific planning, 30-minute per-drive directory snapshots, targeted refresh, Range request/byte telemetry, MD5 metadata reuse and Alias guidance are unchanged.

## Production observation that led to the hotfix

One real 1229 metadata run reported 7260 database references, 7087 unique IPA paths, 114 missing IPA, 6851 remaining to parse, and one successful parser job using 3 Range requests / about 0.5 MB. The same page showed numeric remaining quota but `NaN` in formatted Range summary cards, confirming the problem was presentation rather than the backend budget counters.

## CI verification

Actions #150 / run `34847017796` passed:
- Integration tests
- scheduler configuration contracts
- Range telemetry/UI contracts
- replica preview persistence/schema contracts
- Production build
- Native API smoke
- Native frontend static smoke
- Shell validation
- BaoTa native contract
- MySQL multi-source contract
- GitHub updater contract
- Legacy Docker compose syntax
- deployment package build/validation/artifact upload

`release-e2e` remains skipped by workflow condition, so real BaoTa/OpenList 1230 behavior still needs the short recheck below.

## Recommended real recheck

After upgrading to 2026091230:

1. Open the metadata page and confirm Range usage shows values such as `4/10`, `14/150`, request count and MB instead of `NaN`.
2. Save a non-default scheduler value, for example `10 minutes / 2 IPA`. Reload the page and confirm the same values are returned. Execution can be lower only when the 10/hour or 150/day budget has insufficient remaining quota.
3. In cloud replica management, run one reconciliation. Navigate to another admin page and back; the reconciliation list must restore immediately from `openlist-replica-preview.json`.
4. Re-run “对账（优先快照）” within 30 minutes and confirm it reports snapshot hits rather than re-scanning every physical drive.

Important upgrade detail: preview JSON files produced by buggy 1229 lack `replicaSchemaVersion`, so 1230 intentionally cannot trust that one old preview. Run one fresh reconciliation after upgrade. Existing valid 30-minute per-drive directory snapshots are separate and can still be reused, so this should not require an unnecessary full cloud rescan if those snapshots are fresh.

Real Alias distribution, cross-storage copy completion, mismatch remediation and controlled MySQL `bt1a` migration remain separate production-verification items.