BEGIN;
ALTER TABLE public.quiz_attempts ADD COLUMN score_revision integer NOT NULL DEFAULT 0;
ALTER TABLE public.quiz_attempts ADD COLUMN score_confirmed_at timestamptz;
ALTER TABLE public.quiz_attempts ADD COLUMN score_confirmed_by uuid REFERENCES public.profiles(id);
-- Existing teacher ownership / student-self RLS on attempts remains in force.
CREATE FUNCTION public.quizna_invalidate_confirmation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE public.quiz_attempts SET score_confirmed_at=NULL,score_confirmed_by=NULL,score_revision=score_revision+1 WHERE id=NEW.attempt_id;
 RETURN NEW;
END $$;
CREATE TRIGGER invalidate_score_confirmation AFTER INSERT OR UPDATE ON public.attempt_answers FOR EACH ROW EXECUTE FUNCTION public.quizna_invalidate_confirmation();
ALTER FUNCTION public.quizna_attempt_command(text,uuid,jsonb) RENAME TO quizna_attempt_command_v10;
CREATE FUNCTION public.quizna_attempt_command(p_action text,p_actor uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.quiz_attempts;
BEGIN
 IF p_action='confirm_score' THEN
  SELECT * INTO a FROM public.quiz_attempts WHERE id=(p_payload->>'attempt_id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='QN404'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.quizzes WHERE id=a.quiz_id AND teacher_id=p_actor) THEN RAISE EXCEPTION USING ERRCODE='QN403'; END IF;
  IF a.status='in_progress' OR NOT a.is_graded THEN RAISE EXCEPTION USING ERRCODE='QN400'; END IF;
  IF a.score_confirmed_at IS NOT NULL THEN RETURN to_jsonb(a); END IF;
  IF a.score_revision IS DISTINCT FROM (p_payload->>'expected_revision')::integer THEN RAISE EXCEPTION USING ERRCODE='QN409'; END IF;
  IF a.updated_at IS DISTINCT FROM (p_payload->>'expected_updated_at')::timestamptz THEN RAISE EXCEPTION USING ERRCODE='QN409'; END IF;
  UPDATE public.quiz_attempts SET score_confirmed_at=now(),score_confirmed_by=p_actor WHERE id=a.id RETURNING * INTO a;
  RETURN to_jsonb(a);
 END IF;
 RETURN public.quizna_attempt_command_v10(p_action,p_actor,p_payload);
END $$;
REVOKE ALL ON FUNCTION public.quizna_attempt_command(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.quizna_attempt_command(text,uuid,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.quizna_invalidate_confirmation() FROM PUBLIC,anon,authenticated;
COMMIT;
