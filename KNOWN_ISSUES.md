# Known Issues

## 2026091225 candidate

- Functional-code Actions #91 passed, but real BaoTa 2026091225 deployment and real OpenList multi-drive write operations are not yet verified.
- The OpenList Token used by earlier metadata-only versions may not have permission for `GET /api/admin/storage/list` or file write APIs. Replica discovery/copy/rename/quarantine requires the corresponding OpenList permissions.
- Replica reconciliation assumes every selected physical drive uses the same relative IPA path layout under its configured replica root. Example: `/天翼/app/games/X.ipa` and `/阿里/app/games/X.ipa` both map to relative `games/X.ipa`.
- The MySQL `bt1a` mapping is the authoritative expected list. If the source database is temporarily incomplete or a valid App is intentionally absent from the queried statuses, a real cloud file may appear as `extra`. 1225 therefore never auto-deletes extras; quarantine is manual-only.
- OpenList cross-storage copy may be asynchronous. A successful API submission means the copy was accepted, not necessarily that all bytes are already present on the target. Run reconciliation again after OpenList finishes its task.
- 1225 detects missing paths and extra paths. It does not yet automatically repair a same-name file whose content/hash differs from the expected IPA; that is planned as a follow-up after real provider hash behavior is observed.
- MD5 rename suggestions require a current expected MD5 and exactly one same-directory extra file with the same MD5. Providers that do not expose MD5 may not get automatic rename suggestions.
- Alias coverage inspection is intentionally conservative/heuristic because driver `addition` layout can vary by OpenList version. ZONOE does not auto-create or mutate Alias configuration in 1225; confirm the actual OpenList read-conflict/load-balance mode in OpenList admin.
- Physical storage scan is bounded to 20,000 IPA files and 1,000 directories per configured root. Very large libraries may need pagination/scan-job work in a later version.
- Copy batch is capped at 50 per API call; the current admin button submits at most 20. This is intentional to avoid immediately flooding provider/OpenList task queues.
- The quarantine folder has no automatic retention purge in 1225. Permanent deletion remains intentionally unavailable.
- Multi-drive distribution reduces dependence on one provider/account but cannot guarantee that a cloud provider will never throttle, rate-limit, or restrict an account.
- Existing 1224 caveats remain: dynamic MySQL write-back still needs real database verification and automatic creation of brand-new App rows remains disabled.
