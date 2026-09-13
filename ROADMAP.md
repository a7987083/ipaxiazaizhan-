# Roadmap

## Current — 2026091221 Public IPA metadata discovery

- [x] Multi-MySQL source aggregation / FastAdmin `fa_category` compatibility
- [x] BaoTa Native + systemd runtime, no PostgreSQL runtime dependency
- [x] GitHub admin online updater; 2026091219 real forward-update baseline verified
- [x] OpenList MD5 scan + Range-based IPA `Info.plist` parsing
- [x] v3 safe `appRefs` cache, full admin parse-results explorer and mismatch audit
- [x] Public app detail enrichment with package version / Build / Bundle ID / minimum iOS / actual IPA size
- [x] Public search can match current Bundle ID and parsed package metadata
- [x] Public filters for parsed / pending / failed IPA and target iOS compatibility
- [x] Public cards expose safe parse state without leaking `bt1a`, Token, `raw_url` or internal OpenList path
- [x] Stale-MD5 / failed parse metadata is excluded from public package fields and metadata search
- [x] Contract tests for metadata search/status/iOS version comparison and stale-cache handling
- [x] 2026091221 code CI green at `7f121393e3a3f04dbd9732b5d22eadcf701a64ca` (Actions #55)
- [ ] Deploy 2026091221 to real BaoTa through the existing updater
- [ ] Real-data E2E: Bundle ID search, parsed-status filter, target-iOS filter, app detail fields
- [ ] After real E2E, choose next metadata phase: device family / architecture / signing-encryption diagnostics

## Stable baselines

- `2026091219`: real BaoTa Native/online-update chain verified.
- `2026091220` / `7f48a23c50072fd8a15c50aef74631ca8007504f`: IPA parse-results explorer; GitHub Actions passed.
- `2026091221` code / `7f121393e3a3f04dbd9732b5d22eadcf701a64ca`: public IPA metadata discovery; GitHub Actions #55 passed; real BaoTa E2E pending.
