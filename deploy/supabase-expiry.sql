-- Run after the bootstrap in the Supabase SQL editor as the project administrator.
-- Enable the pg_cron extension in Supabase first. A named job is updated on repeat.
SELECT cron.schedule(
  'quizna-expiry', '* * * * *',
  $$SELECT public.quizna_attempt_command('expire', NULL, '{}'::jsonb)$$
);
SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'quizna-expiry';
