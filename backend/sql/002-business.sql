CREATE TABLE IF NOT EXISTS vulnerabilities (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  source_id VARCHAR(64) NULL,
  source_name VARCHAR(32) NULL,
  source_publish_date DATETIME NULL,
  source_update_date DATETIME NULL,
  source_link VARCHAR(255) NULL,
  affected_version MEDIUMTEXT NULL,
  cvss_score_v4 FLOAT NULL,
  cvss_score_v3 FLOAT NULL,
  cvss_score_v2 FLOAT NULL,
  severity VARCHAR(90) NULL,
  type VARCHAR(255) NULL,
  cwe_id TEXT NULL,
  description TEXT NULL,
  cve_id VARCHAR(512) NULL,
  title VARCHAR(512) NULL,
  revision INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_vul_cve (cve_id),
  INDEX idx_vul_severity (severity),
  INDEX idx_vul_publish (source_publish_date)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS components (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  purl VARCHAR(512) NOT NULL,
  cpe VARCHAR(255) NULL,
  type VARCHAR(255) NULL,
  vendor VARCHAR(255) NULL,
  name VARCHAR(255) NOT NULL,
  version VARCHAR(255) NOT NULL,
  license TEXT NULL,
  description MEDIUMTEXT NULL,
  repository VARCHAR(255) NULL,
  publish_date DATETIME NULL,
  language VARCHAR(255) NULL,
  record_time DATETIME NULL,
  revision INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_comp_purl (purl),
  INDEX idx_comp_name (name),
  INDEX idx_comp_type (type)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS operation_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  resource VARCHAR(32) NOT NULL,
  resource_id BIGINT UNSIGNED NOT NULL,
  action VARCHAR(16) NOT NULL,
  summary VARCHAR(600) NOT NULL,
  before_data JSON NULL,
  after_data JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_logs_created (created_at)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
