# Handoff

- Repo: `a7987083/ipaxiazaizhan-`
- Branch: `feature/baota-native-deploy-v1`
- Candidate: `2026091208`
- Architecture: BaoTa Nginx + Node systemd + existing MySQL software sources.
- PostgreSQL: no longer a 1208 runtime requirement.

## App data model

ZONOE does not own a second app catalog. Admin configures one or more existing MySQL databases with the same `fa_category` schema. Each row is projected into the public API. Global identity is `source_slug:legacy_id`; IPA downloads redirect to `bt1a`.

Known field mapping:

- `id` -> source-local app ID
- `name` -> app name
- `nickname` -> version
- `image` -> icon URL
- `keywords` / `description` -> description
- `weigh` -> source ordering weight
- `bt1a` -> original install/IPA URL
- `bt2a` -> file size
- `cs` -> source download count

## Control plane

`data/control/` stores only ZONOE admin bcrypt hash, settings, encrypted MySQL source definitions and local download audit. `SOURCE_CONFIG_KEY` must stay stable. Changing admin password increments a session version and invalidates existing logins.

## Verification gates

Do not call 1208 production verified until: current-head CI is green, package integrity is checked, real BaoTa can query at least two configured MySQL sources, and admin online update E2E is confirmed.
