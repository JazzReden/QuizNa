BEGIN;
-- Keep the established grading transaction; add optimistic confirmation for scanned essays.
ALTER FUNCTION public.quizna_attempt_command(text,uuid,jsonb) RENAME TO quizna_attempt_command_v8;
CREATE FUNCTION public.quizna_attempt_command(p_action text,p_actor uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE answer_row public.attempt_answers; attempt_row public.quiz_attempts;
BEGIN
 IF p_action='grade' AND coalesce((p_payload->>'require_ungraded')::boolean,false) THEN
  SELECT * INTO answer_row FROM public.attempt_answers WHERE id=(p_payload->>'answer_id')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='QN404'; END IF;
  SELECT * INTO attempt_row FROM public.quiz_attempts WHERE id=answer_row.attempt_id FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM public.quizzes WHERE id=attempt_row.quiz_id AND teacher_id=p_actor) THEN RAISE EXCEPTION USING ERRCODE='QN403'; END IF;
  SELECT * INTO answer_row FROM public.attempt_answers WHERE id=answer_row.id;
  IF btrim(coalesce(answer_row.answer #>> '{}','')) IS DISTINCT FROM btrim(p_payload->>'expected_answer') THEN RAISE EXCEPTION USING ERRCODE='QN409'; END IF;
  IF answer_row.is_manually_graded THEN
   IF answer_row.score_awarded=(p_payload->>'score')::numeric AND coalesce(answer_row.teacher_feedback,'')=coalesce(p_payload->>'feedback','') THEN RETURN to_jsonb(answer_row); END IF;
   RAISE EXCEPTION USING ERRCODE='QN409';
  END IF;
 END IF;
 RETURN public.quizna_attempt_command_v8(p_action,p_actor,p_payload);
END $$;
REVOKE ALL ON FUNCTION public.quizna_attempt_command(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.quizna_attempt_command(text,uuid,jsonb) TO service_role;
COMMIT;
