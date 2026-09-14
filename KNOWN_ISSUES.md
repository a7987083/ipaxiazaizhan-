# Known Issues

## 2026091229 candidate

- Actions #142 / run `34838613229` passed source tests, production build, smoke/contracts, deployment package validation and artifact upload. Real BaoTa/OpenList 1229 behavior is still pending production verification.
- Integrity verification is only as strong as the expected metadata available to ZONOE. When the metadata cache has a valid expected MD5, equal MD5 is authoritative. When comparable MD5 is unavailable, the file is deliberately marked `unverified`; size alone does not prove identical content.
- A known size mismatch is treated as an integrity problem when both expected and actual sizes are available. The expected size comes from the OpenList IPA metadata cache, not blindly from a potentially stale database value.
- MD5/size mismatch files are blocked from automatic source selection and are not automatically overwritten. 1229 intentionally stops at detection/visibility; a later version can add a controlled “quarantine bad copy then refill from verified source” workflow after real validation.
- Source priority uses the persisted order of selected physical mounts. The admin can move drives up/down. Safety wins over preference: a verified source always outranks an unverified source, even if the unverified drive is ranked higher.
- Sync planning is a preview, not a copy operation. Execution recomputes the plan and compares the SHA-256 `planHash`; if the action set changed, the backend returns `REPLICA_PLAN_CHANGED` and requires a new preview.
- The plan hash protects the selected file/source/target action set, but OpenList cross-storage copy can still be asynchronous after submission. A successful `/api/fs/copy` response does not prove the target bytes have finished transferring.
- Existing 1228 reconciliation previews do not contain the new per-copy integrity states. 1229 therefore does not restore an incompatible old preview as current. Run a new reconciliation after upgrade; the existing 30-minute per-drive directory snapshots may still be reused.
- Snapshot/listing data can become stale within the configured TTL. Before risky manual remediation of an integrity issue, force-refresh the affected drive rather than relying on an old snapshot.
- `per_page:0`, targeted refresh, Range Parser budgets, MD5 metadata reuse, Alias behavior, quarantine-only deletion policy and other 1228 safeguards remain unchanged.
- Real BaoTa/OpenList verification is still required for mismatch detection, source-priority selection, sync-plan preview/execution, stale-plan rejection, 7,000+ file request counts and Range telemetry.
- ZONOE still does not automatically create/modify OpenList Alias or rewrite MySQL `bt1a` to Alias paths. Direct physical URLs continue to bypass Alias load balancing.
