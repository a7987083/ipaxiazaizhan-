# Known Issues

## 2026091221 candidate

- **Real BaoTa E2E pending for this candidate.** 2026091220 CI is green and 2026091219 is the documented real updater baseline, but 2026091221 public metadata search/filter still needs a real deployment check.
- **Old or incomplete OpenList cache limits metadata discovery.** Bundle ID/package-field search and IPA/iOS filters require the v3 cache populated by a 1220+ MD5 scan. Apps without a current cache record remain visible in normal lists/search but cannot be positively matched by parsed-only filters.
- **iOS compatibility is intentionally conservative.** `ios=<target>` only compares parsed `MinimumOSVersion`; pending, failed, stale-MD5 or missing values are excluded rather than guessed compatible.
- **No CPU architecture/device-family/signing-encryption diagnostics yet.** Current parser exposes Info.plist-level identity/version/minimum-iOS data and file metadata only. Do not infer decrypted/sideloadable state from the current fields.
- **Large ID-filter SQL has not been real-load benchmarked.** The implementation reuses the v3 metadata index to constrain original MySQL rows. Current catalog scale must be observed on the BaoTa host before raising scan/filter scope further.
- **External MySQL source data remains authoritative.** ZONOE does not edit App rows or duplicate IPA files; source version/size mismatches are informational and admin-audited.
