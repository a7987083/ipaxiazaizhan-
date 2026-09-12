# Known Issues

## 1208 candidate

- **Real BaoTa multi-source E2E pending.** CI uses a deterministic fake MySQL CLI adapter; a real MySQL 5.7/BaoTa connection must still be verified.
- **Admin updater E2E pending on real host.** UI/API/systemd worker are implemented, but do not mark stable until a real forward update succeeds.
- **MySQL client required.** Runtime uses the existing `mysql` CLI client (BaoTa commonly provides `/www/server/mysql/bin/mysql`) to avoid installing a second database engine or adding another Node DB driver. Installer detects/installs only a client if needed.
- **External source DB backups are not taken by ZONOE updates.** Updates do not mutate application rows or IPA files. `writeStats` is opt-in; when disabled, sources are read-only.
- **Old PostgreSQL service is not auto-uninstalled/stopped.** 1208 no longer connects to it, but automatic removal could break unrelated sites on the same server.
