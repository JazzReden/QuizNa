-- Existing quizzes retain their current direct-entry behavior.
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS require_access_code BOOLEAN NOT NULL DEFAULT FALSE;
