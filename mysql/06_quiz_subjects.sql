-- Additive metadata only: existing quizzes, published editions and scores remain unchanged.
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS subject varchar(120) NULL;
