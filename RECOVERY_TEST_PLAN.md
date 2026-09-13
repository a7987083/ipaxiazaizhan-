# 2026091226 Real Account-Switch Validation

1. Deploy 2026091226 and restart `zonoe-api`.
2. Open Admin → 本地缓存 and confirm `MD5 解析库` has entries. If old pre-1226 metadata was already overwritten, parse those entries once to repopulate it.
3. Keep the same IPA bytes available under account A. Run only “后台扫描 MD5” (`parseLimit=0`) and record one app's MD5, Bundle ID, package version and Build.
4. Switch OpenList to account B / a different mount or path containing the same IPA bytes. Save the OpenList configuration.
5. Run only “后台扫描 MD5” again. Do not run “解析 5 个” for this proof.
6. After the scan finishes, wait 1–2 seconds. The same-MD5 IPA should regain the previous package metadata from the persistent MD5 library even though its account/path changed.
7. Replace one test IPA with genuinely different bytes/MD5. Run MD5 scan. It must become pending; old metadata must not be attached.
8. Verify changing the OpenList configuration causes directory listings to be refreshed rather than using the previous account's directory cache.

Passing these checks upgrades the fix from CI-verified to real OpenList account-switch verified.
