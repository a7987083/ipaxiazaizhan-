# Known Issues

## 2026091227 candidate

- Functional Actions #117 / run `34790323206` passed, but real BaoTa/OpenList Alias load-balancing E2E is not yet verified.
- ZONOE 1227 discovers/selects an existing OpenList Alias and guides its configuration; it does **not** automatically create or mutate Alias storage. OpenList driver `addition` layouts can vary by version, so automatic mutation remains deferred until the real deployment is inspected.
- An Alias only participates when downloads use the Alias public path. Existing MySQL `bt1a` URLs such as `/d/a/app/...` that point directly at a physical storage bypass Alias and are not load-balanced. 1227 does not automatically rewrite those database URLs.
- The persisted reconciliation snapshot can be large for many drives because it includes missing/extra rows and the App × drive matrix. Current scanning remains bounded to 20,000 IPA files and 1,000 directories per selected replica root.
- Saving replica configuration intentionally clears the persisted reconciliation snapshot. A fresh reconciliation is required because mount/root changes make the previous result stale.
- Extra/missing lists are paginated in the browser at 100 rows per page, but the complete reconciliation is still produced server-side before display.
- The OpenList program token/“令牌” can access broad API capabilities. Keep it secret, use HTTPS, and only expose ZONOE admin over trusted authentication. The token is stored encrypted by the existing control-store mechanism and is never returned in cleartext to the frontend.
- Permanent deletion of extra IPA is still unavailable. Extras can only be moved to the configured quarantine area when explicitly enabled and confirmed.
- OpenList cross-storage copy may be asynchronous; successful submission does not prove bytes are already present on the target. Reconcile again after OpenList tasks complete.
- 1226 MD5-addressed metadata persistence remains active, but a pre-1226 parse result that was already overwritten cannot be reconstructed locally without an old cache backup and must be parsed once again.
- Existing dynamic MySQL write-back still needs real database verification; automatic creation of brand-new App rows remains disabled.
