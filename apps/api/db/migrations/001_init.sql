CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  username VARCHAR(80) UNIQUE,
  password_hash TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admins (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(80) NOT NULL UNIQUE,
  email VARCHAR(255) UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(30) NOT NULL DEFAULT 'admin' CHECK (role IN ('admin','superadmin')),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_categories_enabled_sort ON categories(enabled, sort_order DESC, id);

CREATE TABLE IF NOT EXISTS apps (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  bundle_id VARCHAR(255) NOT NULL UNIQUE,
  icon_url TEXT,
  short_description VARCHAR(500),
  description TEXT,
  developer VARCHAR(255),
  category_id BIGINT REFERENCES categories(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','unlisted')),
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  hot BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  download_count BIGINT NOT NULL DEFAULT 0,
  current_version_id BIGINT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_apps_status_updated ON apps(status, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_apps_category_status ON apps(category_id, status, sort_order DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_apps_featured ON apps(featured, status, sort_order DESC) WHERE featured = TRUE;
CREATE INDEX IF NOT EXISTS idx_apps_hot ON apps(hot, status, download_count DESC) WHERE hot = TRUE;
CREATE INDEX IF NOT EXISTS idx_apps_name_search ON apps USING gin (to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(bundle_id,'') || ' ' || coalesce(developer,'')));

CREATE TABLE IF NOT EXISTS app_versions (
  id BIGSERIAL PRIMARY KEY,
  app_id BIGINT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  version VARCHAR(100) NOT NULL,
  build VARCHAR(100) NOT NULL DEFAULT '',
  file_size BIGINT,
  min_ios VARCHAR(50),
  changelog TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','disabled')),
  download_count BIGINT NOT NULL DEFAULT 0,
  release_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(app_id, version, build)
);
CREATE INDEX IF NOT EXISTS idx_versions_app_release ON app_versions(app_id, status, release_date DESC, id DESC);
ALTER TABLE apps DROP CONSTRAINT IF EXISTS fk_apps_current_version;
ALTER TABLE apps ADD CONSTRAINT fk_apps_current_version FOREIGN KEY (current_version_id) REFERENCES app_versions(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS tags (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_tags (
  app_id BIGINT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  tag_id BIGINT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY(app_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_app_tags_tag ON app_tags(tag_id, app_id);

CREATE TABLE IF NOT EXISTS screenshots (
  id BIGSERIAL PRIMARY KEY,
  app_id BIGINT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  version_id BIGINT REFERENCES app_versions(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_screenshots_app_sort ON screenshots(app_id, sort_order, id);

CREATE TABLE IF NOT EXISTS download_sources (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  type VARCHAR(30) NOT NULL CHECK (type IN ('local','http','openlist','cloud','cdn','s3','oss','r2','other')),
  base_url TEXT,
  config_encrypted TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  priority INTEGER NOT NULL DEFAULT 100,
  health_status VARCHAR(20) NOT NULL DEFAULT 'unknown' CHECK (health_status IN ('unknown','healthy','degraded','down')),
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sources_enabled_priority ON download_sources(enabled, priority, id);

CREATE TABLE IF NOT EXISTS version_download_sources (
  id BIGSERIAL PRIMARY KEY,
  version_id BIGINT NOT NULL REFERENCES app_versions(id) ON DELETE CASCADE,
  source_id BIGINT NOT NULL REFERENCES download_sources(id) ON DELETE RESTRICT,
  target TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(version_id, source_id, target)
);
CREATE INDEX IF NOT EXISTS idx_vds_resolve ON version_download_sources(version_id, enabled, priority, id);

CREATE TABLE IF NOT EXISTS downloads (
  id BIGSERIAL PRIMARY KEY,
  app_id BIGINT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  version_id BIGINT NOT NULL REFERENCES app_versions(id) ON DELETE CASCADE,
  source_id BIGINT REFERENCES download_sources(id) ON DELETE SET NULL,
  ip_hash CHAR(64),
  user_agent VARCHAR(1000),
  referer VARCHAR(2000),
  status VARCHAR(30) NOT NULL DEFAULT 'redirected',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_downloads_created ON downloads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_downloads_app_created ON downloads(app_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_downloads_version_created ON downloads(version_id, created_at DESC);

CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(120) PRIMARY KEY,
  value JSONB NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO categories(name, slug, sort_order) VALUES
('应用','apps',100),('游戏','games',90),('工具','tools',80),('影音','media',70),('社交','social',60),('效率','productivity',50),('插件','plugins',40),('其他','other',0)
ON CONFLICT DO NOTHING;

INSERT INTO settings(key,value,is_public) VALUES
('site_name','"ZONOE 下载站"'::jsonb,TRUE),
('site_notice','"欢迎使用 ZONOE IPA 下载站"'::jsonb,TRUE),
('hero_title','"探索更多可能，让优秀的应用触手可及"'::jsonb,TRUE)
ON CONFLICT DO NOTHING;
