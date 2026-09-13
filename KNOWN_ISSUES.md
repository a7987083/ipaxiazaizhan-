# Known Issues

## 2026091226 candidate

- Functional/version Actions #103 passed, but the real BaoTa/OpenList account-switch E2E is not yet verified.
- If a pre-1226 account/path switch already caused a later sync to overwrite the only old path-bound `openlist-ipa-cache.json`, those already-lost parsed records cannot be reconstructed locally. They require one new parse unless an external backup of the old cache exists.
- Cross-account/path metadata reuse requires a trustworthy 32-hex MD5. A provider/file listing without MD5 cannot safely use the content-addressed library across paths and will remain conservative.
- MD5 reuse is additionally rejected when both the stored file size and current file size are known and differ.
- 1226 restores MD5 metadata after the active scan completes. A scan launched immediately after an account/path change with `parseLimit > 0` can still redundantly parse a small selected batch before post-scan reconciliation. For the real account-switch proof, use the MD5-only scan first (`parseLimit=0`). A future hardening step will consult the MD5 library inside core parse-candidate selection.
- “清空 IPA 解析缓存” and “清空全部缓存” intentionally clear the persistent MD5 metadata library as well as the active path cache. This is destructive only to local metadata; it never deletes OpenList IPA or MySQL business rows.
- OpenList directory cache is invalidated at service startup and when OpenList config changes. This favors correctness over preserving a 30-minute listing cache across restart/account changes.
- The MD5 metadata library is stored in the persistent ZONOE control directory as JSON. It is not written into source MySQL and contains no OpenList token, raw URL or download URL.
- Real 2026091225 multi-drive storage discovery/copy/rename/quarantine/Alias validation is still pending separately.
- Existing dynamic MySQL write-back still needs real database verification; automatic creation of brand-new App rows remains disabled.
