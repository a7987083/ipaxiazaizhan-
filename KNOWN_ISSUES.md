# Known Issues

## 2026091222 candidate

- GitHub Actions #60 passed, but real BaoTa deployment and real MySQL write-back are not yet verified.
- Auto-writeback is intentionally limited to existing App rows; new IPA files without an existing `source_slug:legacy_id` mapping are not inserted automatically.
- Field semantics depend on each software source schema. ZONOE validates that a target column exists, but cannot know whether a custom column has the business meaning the operator intends.
- For safety, write-back requires exact current `md5 === parsedMd5`. Old caches may need a fresh MD5 scan / parse before they become write-back eligible.
- `always` still skips an UPDATE when the database already contains the same value, avoiding pointless writes.
- Cache clearing is blocked while an OpenList scan/parse task is running.
- Write-back configuration is stored in ZONOE control data and should be included by the existing control-directory backup/update flow; real updater preservation still needs 1222 deployment verification.
- Automatic creation of brand-new App rows is deferred until existing-row write-back is verified against the real software-source schema and operational workflow.
