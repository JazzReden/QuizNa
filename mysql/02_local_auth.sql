-- Additive local-only account/session migration. Existing quiz data is preserved.
CREATE TABLE IF NOT EXISTS local_auth_credentials (
  user_id VARCHAR(36) PRIMARY KEY,
  password_hash VARCHAR(256) NOT NULL,
  FOREIGN KEY(user_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS local_auth_sessions (
  access_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  refresh_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  user_id VARCHAR(36) NOT NULL,
  access_expires_at VARCHAR(32) NOT NULL,
  refresh_expires_at VARCHAR(32) NOT NULL,
  created_at VARCHAR(32) NOT NULL,
  FOREIGN KEY(user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  INDEX(user_id), INDEX(refresh_expires_at)
) ENGINE=InnoDB;
