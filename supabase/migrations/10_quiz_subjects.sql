-- Subject is organizational metadata; frozen questions and scoring are unchanged.
-- The existing quizzes RLS policies continue to restrict teacher ownership.
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS subject varchar(120);
