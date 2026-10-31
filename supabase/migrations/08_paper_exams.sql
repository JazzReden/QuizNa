BEGIN;
ALTER TABLE public.quizzes ADD COLUMN exam_format text NOT NULL DEFAULT 'online' CHECK(exam_format IN ('online','paper'));
CREATE TABLE public.paper_sheets (
 id uuid PRIMARY KEY, quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
 quiz_version_id uuid NOT NULL REFERENCES public.quiz_versions(id) ON DELETE CASCADE,
 student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 section_id uuid NOT NULL REFERENCES public.quiz_sections(id) ON DELETE CASCADE,
 token varchar(64) NOT NULL, layout jsonb NOT NULL, attempt_id uuid UNIQUE REFERENCES public.quiz_attempts(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX paper_one_open ON public.paper_sheets(quiz_id,student_id) WHERE attempt_id IS NULL;
CREATE INDEX paper_quiz_student ON public.paper_sheets(quiz_id,student_id,created_at DESC);
ALTER TABLE public.quiz_attempts ADD COLUMN paper_sheet_id uuid UNIQUE REFERENCES public.paper_sheets(id) ON DELETE SET NULL;
ALTER TABLE public.paper_sheets ENABLE ROW LEVEL SECURITY;
CREATE POLICY paper_owner_read ON public.paper_sheets FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.quizzes q WHERE q.id=quiz_id AND q.teacher_id=auth.uid()));
REVOKE ALL ON public.paper_sheets FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.paper_sheets TO authenticated;
GRANT ALL ON public.paper_sheets TO service_role;
CREATE FUNCTION public.quizna_freeze_exam_format() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 NEW.snapshot_data:=NEW.snapshot_data||jsonb_build_object('exam_format',(SELECT exam_format FROM public.quizzes WHERE id=NEW.quiz_id));
 RETURN NEW;
END; $$;
CREATE TRIGGER freeze_exam_format BEFORE INSERT ON public.quiz_versions FOR EACH ROW EXECUTE FUNCTION public.quizna_freeze_exam_format();
CREATE FUNCTION public.quizna_guard_paper_attempt() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF (SELECT exam_format FROM public.quizzes WHERE id=NEW.quiz_id)='paper' AND NEW.paper_sheet_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='QN400'; END IF;
 IF NEW.paper_sheet_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.paper_sheets s WHERE s.id=NEW.paper_sheet_id AND s.quiz_id=NEW.quiz_id AND s.student_id=NEW.student_id AND s.quiz_version_id=NEW.quiz_version_id AND s.section_id=NEW.section_id) THEN RAISE EXCEPTION USING ERRCODE='QN403'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER guard_paper_attempt BEFORE INSERT ON public.quiz_attempts FOR EACH ROW EXECUTE FUNCTION public.quizna_guard_paper_attempt();
CREATE FUNCTION public.quizna_paper_command(p_action text,p_actor uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.paper_sheets; q public.quizzes; v public.quiz_versions; a public.quiz_attempts; n integer; item jsonb; frozen jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='teacher') THEN RAISE EXCEPTION USING ERRCODE='QN403'; END IF;
 IF p_action='issue' THEN
  SELECT * INTO q FROM public.quizzes WHERE id=(p_payload->>'quiz_id')::uuid;
  IF q.teacher_id IS DISTINCT FROM p_actor THEN RAISE EXCEPTION USING ERRCODE='QN403'; END IF;
  IF q.exam_format<>'paper' OR q.status<>'published' THEN RAISE EXCEPTION USING ERRCODE='QN400'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(q.id::text||(p_payload->>'student_id'),0));
  SELECT * INTO s FROM public.paper_sheets WHERE quiz_id=q.id AND student_id=(p_payload->>'student_id')::uuid AND attempt_id IS NULL ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    IF s.section_id<>(p_payload->>'section_id')::uuid THEN RAISE EXCEPTION USING ERRCODE='QN400'; END IF;
    RETURN to_jsonb(s);
  END IF;
  IF (SELECT count(*) FROM public.quiz_attempts WHERE quiz_id=q.id AND student_id=(p_payload->>'student_id')::uuid)>=q.max_attempts THEN RAISE EXCEPTION USING ERRCODE='QN409'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.quiz_sections qs JOIN public.class_sections c ON c.id=qs.class_section_id WHERE qs.id=(p_payload->>'section_id')::uuid AND qs.quiz_id=q.id AND c.teacher_id=p_actor) OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=(p_payload->>'student_id')::uuid AND role='student') THEN RAISE EXCEPTION USING ERRCODE='QN400'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.quiz_versions WHERE id=(p_payload->>'quiz_version_id')::uuid AND quiz_id=q.id AND version_number=q.version AND snapshot_data->>'exam_format'='paper') THEN RAISE EXCEPTION USING ERRCODE='QN400'; END IF;
  INSERT INTO public.paper_sheets(id,quiz_id,quiz_version_id,student_id,section_id,token,layout)
  VALUES((p_payload->>'id')::uuid,q.id,(p_payload->>'quiz_version_id')::uuid,(p_payload->>'student_id')::uuid,(p_payload->>'section_id')::uuid,p_payload->>'token',p_payload->'layout') RETURNING * INTO s;
  INSERT INTO public.section_students(class_section_id,full_name,email)
  SELECT qs.class_section_id,left(btrim(p.full_name),160),lower(btrim(p.email)) FROM public.quiz_sections qs,public.profiles p WHERE qs.id=s.section_id AND p.id=s.student_id ON CONFLICT(class_section_id,email) DO NOTHING;
  RETURN to_jsonb(s);
 END IF;
 SELECT * INTO s FROM public.paper_sheets WHERE id=(p_payload->>'sheet_id')::uuid FOR UPDATE;
 SELECT * INTO q FROM public.quizzes WHERE id=s.quiz_id;
 IF s.id IS NULL OR q.teacher_id IS DISTINCT FROM p_actor THEN RAISE EXCEPTION USING ERRCODE='QN403'; END IF;
 IF p_action<>'save' OR q.exam_format<>'paper' THEN RAISE EXCEPTION USING ERRCODE='QN400'; END IF;
 IF s.attempt_id IS NOT NULL THEN RETURN (SELECT to_jsonb(x) FROM public.quiz_attempts x WHERE id=s.attempt_id); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(q.id::text||s.student_id::text,0));
 SELECT count(*) INTO n FROM public.quiz_attempts WHERE quiz_id=q.id AND student_id=s.student_id;
 IF n>=q.max_attempts THEN RAISE EXCEPTION USING ERRCODE='QN409'; END IF;
 IF EXISTS(SELECT 1 FROM public.quiz_attempts WHERE quiz_id=q.id AND student_id=s.student_id AND section_id IS DISTINCT FROM s.section_id) THEN RAISE EXCEPTION USING ERRCODE='QN400'; END IF;
 SELECT * INTO v FROM public.quiz_versions WHERE id=s.quiz_version_id AND quiz_id=q.id;
 IF jsonb_array_length(p_payload->'answers')<>jsonb_array_length(v.snapshot_data->'questions') OR (SELECT count(DISTINCT x->>'question_id') FROM jsonb_array_elements(p_payload->'answers') x)<>jsonb_array_length(v.snapshot_data->'questions') THEN RAISE EXCEPTION USING ERRCODE='QN400'; END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(p_payload->'answers') LOOP
  SELECT x INTO frozen FROM jsonb_array_elements(v.snapshot_data->'questions') x WHERE x->>'id'=item->>'question_id';
  IF frozen IS NULL OR jsonb_typeof(item->'answer') NOT IN ('null','string') THEN RAISE EXCEPTION USING ERRCODE='QN400'; END IF;
  IF frozen->>'type' IN ('mcq','true_false') AND item->>'answer' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(frozen->'options') o WHERE o->>'id'=item->>'answer') THEN RAISE EXCEPTION USING ERRCODE='QN400'; END IF;
 END LOOP;
 INSERT INTO public.quiz_attempts(quiz_id,quiz_version_id,paper_sheet_id,student_id,section_id,attempt_number,deadline_at,max_score,question_order)
 VALUES(q.id,v.id,s.id,s.student_id,s.section_id,n+1,clock_timestamp()+interval '1 hour',(SELECT sum((x->>'points')::numeric) FROM jsonb_array_elements(v.snapshot_data->'questions') x),(SELECT jsonb_agg(x->>'id') FROM jsonb_array_elements(s.layout->'questions') x)) RETURNING * INTO a;
 INSERT INTO public.attempt_answers(attempt_id,question_id,answer) SELECT a.id,(x->>'question_id')::uuid,x->'answer' FROM jsonb_array_elements(p_payload->'answers') x;
 a:=public.quizna_finalize(a.id,'submitted');
 UPDATE public.paper_sheets SET attempt_id=a.id WHERE id=s.id;
 RETURN to_jsonb(a);
END; $$;
REVOKE ALL ON FUNCTION public.quizna_freeze_exam_format(),public.quizna_guard_paper_attempt(),public.quizna_paper_command(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.quizna_paper_command(text,uuid,jsonb) TO service_role;
CREATE FUNCTION public.quizna_lock_exam_format() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF OLD.version>1 AND NEW.exam_format IS DISTINCT FROM OLD.exam_format THEN RAISE EXCEPTION USING ERRCODE='QN400'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER lock_exam_format BEFORE UPDATE OF exam_format ON public.quizzes FOR EACH ROW EXECUTE FUNCTION public.quizna_lock_exam_format();
REVOKE ALL ON FUNCTION public.quizna_lock_exam_format() FROM PUBLIC,anon,authenticated;
COMMIT;
