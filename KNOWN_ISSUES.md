# Known Issues

## 2026091228 candidate

- Actions #135 / run `34825687295` passed source/build/contracts/package validation, but real BaoTa/OpenList traffic behavior is not yet verified.
- `per_page:0` reduces ZONOE → OpenList list-call count for large flat directories, but nested replica roots still require one `/api/fs/list` per visited directory. OpenList may also perform provider-side work according to its own cache/driver behavior; ZONOE keeps `refresh:false` and does not explicitly force provider refresh.
- Persistent replica snapshots live in `CONTROL_DIR/openlist-replica-snapshots.json` and can be large because they retain file metadata for each selected drive/root. TTL is 30 minutes; saving replica configuration clears them.
- Copy invalidates only target-drive snapshots. OpenList cross-storage copy may be asynchronous, so a target-only refresh performed too early can still show the old state; wait for OpenList background copy to finish and refresh that target again.
- Rename/quarantine now refresh only affected drives. The resulting reconciliation still rereads the current MySQL expected list and OpenList storage list, but it does not rescan unaffected drive trees.
- Range Parser `raw_url` traffic bypasses OpenList directory cache. 1228 therefore enforces 10 parse attempts per rolling hour and 150 per UTC day and shows real `range_requests` / `range_bytes` metrics.
- The 16 MiB per-IPA Range ceiling is intentionally unchanged. Lowering it before collecting real IPA telemetry could increase false parse failures because ZIP central-directory and `Info.plist` access patterns vary.
- The hourly/daily Range budget counts parse attempts conservatively. A selected item that fails before making a Range request can still consume an attempt while showing zero Range requests/bytes.
- Same-MD5 metadata reuse depends on a valid 32-hex MD5 and compatible known size. Providers that do not expose MD5 still fall back to the existing size/modified change-detection path and cannot use content-addressed reuse safely.
- ZONOE 1227/1228 discovers/selects an existing OpenList Alias and guides its configuration; it does not automatically create or mutate Alias storage. Existing MySQL `bt1a` URLs pointing directly to a physical mount still bypass Alias load balancing.
- Permanent deletion of extra IPA remains unavailable; extras can only be moved to the configured quarantine area when explicitly enabled and confirmed.
- Real account-switch MD5 reuse, real Alias distribution, real cross-storage copy/rename/quarantine, dynamic MySQL write-back and the new request-profile behavior remain pending production verification unless separately tested.
