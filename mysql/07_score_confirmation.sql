-- Additive migration. Existing numeric scores and answers remain unchanged.
ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS score_confirmed_at VARCHAR(40) NULL;
ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS score_confirmed_by CHAR(36) NULL;

ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS score_revision INT NOT NULL DEFAULT 0;
