-- Quiz tables remain RLS-enabled and API-only (see migration 04).
-- No changes to saved answers, scores, deadlines or published snapshots.
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS require_access_code boolean NOT NULL DEFAULT false;
