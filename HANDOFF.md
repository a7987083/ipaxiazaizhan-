# Handoff

- Repo: `a7987083/ipaxiazaizhan-`
- Branch: `feature/baota-native-deploy-v1`
- Candidate: `2026091231`
- Baseline: `2026091230` / `cbbe8065db127619353d4ff2eecbdd2f144bf0f0`
- Functional code: `4f574815d9ad2fba94ef910f5c2904f19c3937d9`
- Functional CI: Actions #156 / run `34852734004` passed validation and package jobs.
- Real BaoTa/OpenList 1231 recheck: pending.

## What 1231 changes

1. Removes the old global Range Parser hard caps of 10 parse attempts/hour and 150/day. Scheduled/manual parsing is no longer shrunk by an hourly/daily remaining-quota calculation.
2. Range Parser remains single-concurrency sequential. Existing per-run validation stays 1–20 IPA and schedule interval validation stays 5–1440 minutes.
3. Range usage remains fully metered. `openlist-range-usage.json` continues to retain parse attempts, success/failure, Range request count and real bytes read; the data is now telemetry only, not a quota gate.
4. The admin Range summary now shows plain totals: `本小时`, `今日`, `今日 Range 请求`, `今日真实读取`. `/10`, `/150`, “剩余额度” and “预算拦截” are removed.
5. Schedule save/sync copy no longer claims a 10/hour or 150/day protection that no longer exists. The recommended default remains 15 minutes / 1 IPA, but saved 5–1440 minute / 1–20 IPA values are authoritative.
6. Desktop admin navigation is now sticky: the left menu stays visible while long pages scroll. It uses a full-viewport sidebar with its own overflow when needed.
7. The mobile admin navigation remains the existing fixed bottom menu; mobile CSS explicitly resets desktop sticky properties.
8. 1230 replica preview persistence and the independent 30-minute per-drive snapshot cache are preserved unchanged.

## Why the Range cap was removed

Production observation showed typical parses using about 2 Range requests and less than 1 MiB of real read traffic per IPA. Under that observed profile, the old attempt-count caps were more conservative than necessary and also made administrator-defined scheduling misleading. 1231 therefore keeps the low-risk controls that map directly to load—single concurrency, per-run maximum, measured requests/bytes—while removing the fixed hourly/daily attempt quota.

## CI verification

Actions #156 / run `34852734004` passed:
- Integration tests
- Range telemetry-only contracts
- scheduler configuration contracts
- admin sticky-sidebar contract
- Production build
- Native API smoke
- Native frontend static smoke
- Shell validation
- BaoTa native contract
- MySQL multi-source contract
- GitHub updater contract
- Legacy Docker compose syntax
- deployment package build/validation/artifact upload

`release-e2e` remains skipped by workflow condition. A final CI run after the 2026091231 version/docs commit is still required before declaring the release package final.

## Recommended real recheck

After upgrading to 2026091231:

1. Save a non-default schedule such as `5 minutes / 5 IPA`, reload the page, and confirm the same values return without a server error.
2. Confirm Range usage shows plain totals such as `本小时 9` and `今日 22`; there must be no `/10`, `/150` or remaining-quota row.
3. Trigger a manual/scheduled parse when the historical hour/day counts are already above the former limits and confirm parsing still follows the requested per-run count (subject only to available eligible IPA and the 1–20 per-run validation).
4. Scroll a long desktop admin page and confirm the left navigation remains visible. On mobile, confirm the bottom navigation still behaves as before.
5. Recheck the 1230 replica cache fix: reconcile once, navigate away/back, then run “对账（优先快照）” inside 30 minutes and confirm persisted preview/snapshot reuse.

Real Alias distribution, cross-storage copy completion, mismatch remediation and controlled MySQL `bt1a` migration remain separate production-verification items.