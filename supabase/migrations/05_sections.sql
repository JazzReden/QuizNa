BEGIN;
CREATE TABLE IF NOT EXISTS public.quiz_sections (
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
 name varchar(80) NOT NULL CHECK(length(btrim(name))>0),
 access_code varchar(12) NOT NULL UNIQUE CHECK(access_code ~ '^S-[A-F0-9]{8}$'),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS quiz_sections_name ON public.quiz_sections(quiz_id,lower(name));
ALTER TABLE public.quiz_attempts ADD COLUMN IF NOT EXISTS section_id uuid REFERENCES public.quiz_sections(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS quiz_attempts_section ON public.quiz_attempts(quiz_id,section_id,status,is_graded);
ALTER TABLE public.quiz_sections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sections_owner_read ON public.quiz_sections;
CREATE POLICY sections_owner_read ON public.quiz_sections FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.quizzes q WHERE q.id=quiz_id AND q.teacher_id=auth.uid()));
REVOKE ALL ON public.quiz_sections FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.quiz_sections TO authenticated;
GRANT ALL ON public.quiz_sections TO service_role;
CREATE OR REPLACE FUNCTION public.quizna_attempt_command(p_action text,p_actor uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE section public.quiz_sections; a public.quiz_attempts; quiz public.quizzes; v public.quiz_versions; answer_row public.attempt_answers; incident public.quiz_incidents;
  q jsonb; ordered jsonb; deadline timestamptz; n integer; last_time timestamptz; t timestamptz; final_status text; action_taken text;
BEGIN
  IF p_action='expire' THEN
    FOR a IN SELECT * FROM public.quiz_attempts WHERE status='in_progress' AND deadline_at<=clock_timestamp() LIMIT 100 FOR UPDATE SKIP LOCKED
    LOOP PERFORM public.quizna_finalize(a.id,'timed_out'); END LOOP;
    RETURN '{}'::jsonb;
  END IF;
  IF p_action='publish' THEN
    SELECT * INTO quiz FROM public.quizzes WHERE id=(p_payload->>'quiz_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='QN404'; END IF;
    IF quiz.teacher_id IS DISTINCT FROM p_actor THEN RAISE EXCEPTION USING ERRCODE='QN403'; END IF;
    SELECT jsonb_agg(to_jsonb(question_row) ORDER BY order_index) INTO ordered FROM public.questions question_row WHERE question_row.quiz_id=quiz.id;
    IF ordered IS NULL THEN RAISE EXCEPTION USING ERRCODE='QN400'; END IF;
    SELECT greatest(quiz.version,coalesce(max(version_number),0))+1 INTO n FROM public.quiz_versions WHERE quiz_id=quiz.id;
    INSERT INTO public.quiz_versions(quiz_id,version_number,snapshot_data) VALUES(quiz.id,n,
      jsonb_build_object('title',quiz.title,'instructions',quiz.instructions,'time_limit_minutes',quiz.time_limit_minutes,
        'max_attempts',quiz.max_attempts,'randomize_questions',quiz.randomize_questions,'randomize_options',quiz.randomize_options,'questions',ordered));
    UPDATE public.quizzes SET status='published',version=n WHERE id=quiz.id RETURNING * INTO quiz;
    RETURN to_jsonb(quiz);
  END IF;
  IF p_action='grade' THEN
    SELECT * INTO answer_row FROM public.attempt_answers WHERE id=(p_payload->>'answer_id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='QN404'; END IF;
    SELECT * INTO a FROM public.quiz_attempts WHERE id=answer_row.attempt_id FOR UPDATE;
    IF NOT EXISTS(SELECT 1 FROM public.quizzes WHERE id=a.quiz_id AND teacher_id=p_actor) THEN RAISE EXCEPTION USING ERRCODE='QN403'; END IF;
    IF a.status='in_progress' THEN RAISE EXCEPTION USING ERRCODE='QN400'; END IF;
    SELECT value INTO q FROM public.quiz_versions version_row,jsonb_array_elements(version_row.snapshot_data->'questions') WHERE version_row.id=a.quiz_version_id AND value->>'id'=answer_row.question_id::text;
    IF q IS NULL OR (p_payload->>'score')::numeric<0 OR (p_payload->>'score')::numeric>(q->>'points')::numeric THEN RAISE EXCEPTION USING ERRCODE='QN400'; END IF;
    UPDATE public.attempt_answers SET score_awarded=(p_payload->>'score')::numeric,teacher_feedback=p_payload->>'feedback',is_manually_graded=true WHERE id=answer_row.id RETURNING * INTO answer_row;
    UPDATE public.quiz_attempts SET score=(SELECT coalesce(sum(score_awarded),0) FROM public.attempt_answers WHERE attempt_id=a.id),
      is_graded=NOT EXISTS(SELECT 1 FROM public.quiz_versions version_row,jsonb_array_elements(version_row.snapshot_data->'questions') item
        WHERE version_row.id=a.quiz_version_id AND item->>'type'='essay' AND NOT EXISTS(
          SELECT 1 FROM public.attempt_answers ans WHERE ans.attempt_id=a.id AND ans.question_id=(item->>'id')::uuid AND ans.is_manually_graded))
      WHERE id=a.id;
    RETURN to_jsonb(answer_row);
  END IF;
  IF p_action='assign_section' THEN
    SELECT * INTO a FROM public.quiz_attempts WHERE id=(p_payload->>'attempt_id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='QN404'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.quizzes WHERE id=a.quiz_id AND teacher_id=p_actor) THEN RAISE EXCEPTION USING ERRCODE='QN403'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(a.quiz_id::text||a.student_id::text,0));
    IF EXISTS(SELECT 1 FROM public.quiz_attempts WHERE quiz_id=a.quiz_id AND student_id=a.student_id AND status='in_progress') THEN RAISE EXCEPTION USING ERRCODE='QN400'; END IF;
    IF p_payload->>'section_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.quiz_sections WHERE id=(p_payload->>'section_id')::uuid AND quiz_id=a.quiz_id) THEN RAISE EXCEPTION USING ERRCODE='QN400'; END IF;
    UPDATE public.quiz_attempts SET section_id=(p_payload->>'section_id')::uuid WHERE quiz_id=a.quiz_id AND student_id=a.student_id;
    SELECT * INTO a FROM public.quiz_attempts WHERE id=a.id;
    RETURN to_jsonb(a);
  END IF;
  IF p_action='start' THEN
    IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='student') THEN RAISE EXCEPTION USING ERRCODE='QN403'; END IF;
    SELECT * INTO quiz FROM public.quizzes WHERE access_code=upper(btrim(p_payload->>'access_code'));
    IF NOT FOUND THEN
      SELECT * INTO section FROM public.quiz_sections WHERE access_code=upper(btrim(p_payload->>'access_code'));
      IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='QN404'; END IF;
      SELECT * INTO quiz FROM public.quizzes WHERE id=section.quiz_id;
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(quiz.id::text||p_actor::text,0));
    IF EXISTS(SELECT 1 FROM public.quiz_attempts WHERE quiz_id=quiz.id AND student_id=p_actor AND section_id IS DISTINCT FROM section.id) THEN RAISE EXCEPTION USING ERRCODE='QN409'; END IF;
    -- Resume before checking availability: editing/closing a quiz cannot invalidate an active attempt.
    SELECT * INTO a FROM public.quiz_attempts WHERE quiz_id=quiz.id AND student_id=p_actor AND status='in_progress' FOR UPDATE;
    IF FOUND AND a.deadline_at>clock_timestamp() THEN RETURN jsonb_build_object('attempt',to_jsonb(a),'isResumed',true); END IF;
    IF a.id IS NOT NULL THEN
      a:=public.quizna_finalize(a.id,'timed_out');
      RETURN jsonb_build_object('attempt',to_jsonb(a),'isResumed',true);
    END IF;
    IF quiz.status<>'published' OR quiz.available_from>clock_timestamp() OR quiz.available_until<=clock_timestamp() THEN RAISE EXCEPTION USING ERRCODE='QN400'; END IF;
    SELECT * INTO v FROM public.quiz_versions WHERE quiz_id=quiz.id AND version_number=quiz.version;
    IF NOT FOUND OR jsonb_array_length(v.snapshot_data->'questions')=0 THEN RAISE EXCEPTION USING ERRCODE='QN400'; END IF;
    SELECT count(*) INTO n FROM public.quiz_attempts WHERE quiz_id=quiz.id AND student_id=p_actor;
    IF n>=quiz.max_attempts THEN RAISE EXCEPTION USING ERRCODE='QN409'; END IF;
    SELECT jsonb_agg(value->>'id' ORDER BY CASE WHEN (v.snapshot_data->>'randomize_questions')::boolean THEN random() ELSE ord::float8 END)
      INTO ordered FROM jsonb_array_elements(v.snapshot_data->'questions') WITH ORDINALITY AS e(value,ord);
    deadline:=least(clock_timestamp()+make_interval(mins=>(v.snapshot_data->>'time_limit_minutes')::int),coalesce(quiz.available_until,'infinity'::timestamptz));
    INSERT INTO public.quiz_attempts(section_id,quiz_id,quiz_version_id,student_id,attempt_number,deadline_at,max_score,question_order)
    VALUES(section.id,quiz.id,v.id,p_actor,n+1,deadline,(SELECT sum((value->>'points')::numeric) FROM jsonb_array_elements(v.snapshot_data->'questions')),ordered) RETURNING * INTO a;
    RETURN jsonb_build_object('attempt',to_jsonb(a),'isResumed',false);
  END IF;

  SELECT * INTO a FROM public.quiz_attempts WHERE id=(p_payload->>'attempt_id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='QN404'; END IF;
  IF p_action IN ('save','incident') AND a.student_id IS DISTINCT FROM p_actor THEN RAISE EXCEPTION USING ERRCODE='QN403'; END IF;
  IF p_action='finalize' THEN
    RETURN to_jsonb(public.quizna_finalize(a.id,p_payload->>'status'));
  END IF;
  IF p_action='pardon' THEN
    IF NOT EXISTS(SELECT 1 FROM public.quizzes WHERE id=a.quiz_id AND teacher_id=p_actor) THEN RAISE EXCEPTION USING ERRCODE='QN403'; END IF;
    IF a.status<>'in_progress' OR clock_timestamp()>=a.deadline_at THEN RAISE EXCEPTION USING ERRCODE='QN400'; END IF;
    INSERT INTO public.quiz_incidents(attempt_id,incident_type,warning_number,details) VALUES(a.id,'window_blur',greatest(1,a.warning_count),jsonb_build_object('action','teacher_pardon','teacher_id',p_actor));
    UPDATE public.quiz_attempts SET warning_count=greatest(0,warning_count-1) WHERE id=a.id RETURNING * INTO a;
    RETURN to_jsonb(a);
  END IF;
  IF clock_timestamp()>=a.deadline_at AND a.status='in_progress' THEN a:=public.quizna_finalize(a.id,'timed_out'); END IF;
  IF p_action='save' THEN
    -- Return a committed closed response instead of raising, so expiry is not rolled back.
    IF a.status<>'in_progress' THEN RETURN jsonb_build_object('status','closed','attempt_id',a.id,'attempt_status',a.status); END IF;
    SELECT value INTO q FROM public.quiz_versions version_row,jsonb_array_elements(version_row.snapshot_data->'questions') WHERE version_row.id=a.quiz_version_id AND value->>'id'=p_payload->>'question_id';
    IF q IS NULL THEN RAISE EXCEPTION USING ERRCODE='QN400'; END IF;
    IF jsonb_typeof(p_payload->'answer') NOT IN ('string','null') THEN RAISE EXCEPTION USING ERRCODE='QN400'; END IF;
    IF q->>'type' IN ('mcq','true_false') AND p_payload->'answer'<>'null'::jsonb AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(q->'options') option_row WHERE option_row->>'id'=p_payload->>'answer') THEN RAISE EXCEPTION USING ERRCODE='QN400'; END IF;
    IF length(p_payload->>'answer')>50000 THEN RAISE EXCEPTION USING ERRCODE='QN400'; END IF;
    INSERT INTO public.attempt_answers(attempt_id,question_id,answer) VALUES(a.id,(p_payload->>'question_id')::uuid,p_payload->'answer')
    ON CONFLICT(attempt_id,question_id) DO UPDATE SET answer=excluded.answer RETURNING * INTO answer_row;
    RETURN jsonb_build_object('status','saved','answer',to_jsonb(answer_row));
  END IF;
  IF p_action='incident' THEN
    t:=clock_timestamp();
    SELECT max(occurred_at) INTO last_time FROM public.quiz_incidents WHERE attempt_id=a.id;
    IF a.status<>'in_progress' OR t-a.started_at<interval '3 seconds' OR t-last_time<interval '2 seconds' THEN
      RETURN jsonb_build_object('deduplicated',true,'warning_number',a.warning_count,'action_taken','none');
    END IF;
    n:=least(3,a.warning_count+1);
    INSERT INTO public.quiz_incidents(attempt_id,incident_type,warning_number,details,occurred_at) VALUES(a.id,p_payload->>'incident_type',n,coalesce(p_payload->'details','{}'::jsonb),t) RETURNING * INTO incident;
    UPDATE public.quiz_attempts SET warning_count=n WHERE id=a.id RETURNING * INTO a;
    action_taken:=CASE n WHEN 1 THEN 'first_warning' WHEN 2 THEN 'final_warning' ELSE 'terminated' END;
    IF n=3 THEN a:=public.quizna_finalize(a.id,'terminated_violation'); END IF;
    RETURN jsonb_build_object('deduplicated',false,'warning_number',n,'action_taken',action_taken,'incident',to_jsonb(incident));
  END IF;
  RAISE EXCEPTION 'Unknown command';
END $$;

REVOKE ALL ON FUNCTION public.quizna_attempt_command(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.quizna_attempt_command(text,uuid,jsonb) TO service_role;
COMMIT;
