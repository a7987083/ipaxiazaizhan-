# Architecture — 2026091208

## Runtime

- Frontend: React static build served directly by BaoTa Nginx.
- API: Node.js 22 / Express, systemd `zonoe-api`, bound to `127.0.0.1:3000`.
- Application catalog: one or more existing MySQL software-source databases.
- Local control plane: small JSON files under `data/control`; source connection secrets are encrypted.
- IPA storage: unchanged original URLs. ZONOE performs 302 redirects and does not duplicate files.

```text
Browser
  -> BaoTa Nginx
      -> static public/
      -> /api /download /healthz -> Node API
           -> controlStore (data/control)
           -> MySQL source A / fa_category
           -> MySQL source B / fa_category
           -> MySQL source N / fa_category
```

## Multi-source identity

Each source has a stable slug. App identity is `<source_slug>:<legacy_id>`, so identical MySQL primary keys across separate databases are safe.

## Security boundaries

- `zonoe-api` runs as the low-privilege `zonoe` system user.
- MySQL passwords are AES-256-GCM encrypted with `SOURCE_CONFIG_KEY` before storage.
- Admin passwords are bcrypt hashes; changing password increments a session version and invalidates existing JWT sessions.
- GitHub online update is queued by the API but executed by a fixed root systemd path/service worker.
- MySQL source queries are read-only by default. Download count write-back is explicit per-source opt-in.

## Why no PostgreSQL runtime

The user already owns multiple MySQL software-source databases with identical schemas. Maintaining a second application catalog wastes storage and creates sync problems. 1208 therefore reads those sources directly and keeps only minimal ZONOE control state locally.
