# Handoff

- Repo: `a7987083/ipaxiazaizhan-`
- Branch: `feature/baota-native-deploy-v1`
- Candidate: `2026091222`
- Baseline: `2026091221` / `1ef29b4f974808f5e8327581d3e20f17faae8ee2` (CI passed)
- Production/runtime verification for 1222: pending.

## What 1222 changes

1. Admin site settings are now a Chinese multi-field form.
2. A dedicated Local Cache page can inspect/clear local OpenList directory and IPA metadata caches without touching remote IPA or MySQL data.
3. A dedicated Data Sync page configures per-source IPA → MySQL mappings.
4. Every parsed field has an independent enable switch, target DB column and strategy.
5. Source write-back and automatic write-back both default OFF.
6. Only current, successful IPA parses with exact `md5 === parsedMd5` qualify for DB write-back.
7. 1222 only updates existing App rows. It never auto-creates a new `fa_category` row.
8. Manual preview/apply and write-back history are available.
9. Optional auto-apply is performed by an idempotent background scheduler; unchanged values are skipped.

## Storage

Write-back configuration/history/state lives under the existing ZONOE `CONTROL_DIR`:

- `source-writeback.json`
- `source-writeback-history.jsonl`
- `source-writeback-state.json`

No MySQL credentials or OpenList token are copied into these files.

## Recommended real deployment validation

Keep source write-back disabled first. Open Data Sync, confirm real table columns/mapping suggestions, save mappings, and run Preview. Then enable only one low-risk field (e.g. package version → `nickname`, strategy changed), manually apply to one or a few existing Apps, verify the original source backend, then consider auto-apply.
