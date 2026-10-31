BEGIN;
CREATE TABLE public.class_sections (
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(), teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 name varchar(80) NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 80), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX teacher_class_name ON public.class_sections(teacher_id,lower(btrim(name)));
CREATE TABLE public.section_students (
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(), class_section_id uuid NOT NULL REFERENCES public.class_sections(id) ON DELETE CASCADE,
 full_name varchar(160) NOT NULL CHECK(length(btrim(full_name)) BETWEEN 1 AND 160),
 email varchar(254) NOT NULL CHECK(email=lower(btrim(email)) AND email LIKE '%@%'), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(class_section_id,email)
);
ALTER TABLE public.quiz_sections ADD COLUMN class_section_id uuid REFERENCES public.class_sections(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX quiz_class_section ON public.quiz_sections(quiz_id,class_section_id);
INSERT INTO public.class_sections(id,teacher_id,name,created_at)
 SELECT DISTINCT ON(q.teacher_id,lower(btrim(s.name))) s.id,q.teacher_id,btrim(s.name),s.created_at
 FROM public.quiz_sections s JOIN public.quizzes q ON q.id=s.quiz_id ORDER BY q.teacher_id,lower(btrim(s.name)),s.created_at,s.id;
UPDATE public.quiz_sections s SET class_section_id=c.id FROM public.quizzes q,public.class_sections c
 WHERE q.id=s.quiz_id AND c.teacher_id=q.teacher_id AND lower(c.name)=lower(btrim(s.name));
INSERT INTO public.section_students(class_section_id,full_name,email,created_at)
 SELECT s.class_section_id,left(p.full_name,160),lower(btrim(p.email)),min(a.started_at)
 FROM public.quiz_attempts a JOIN public.quiz_sections s ON s.id=a.section_id JOIN public.profiles p ON p.id=a.student_id
 WHERE s.class_section_id IS NOT NULL GROUP BY s.class_section_id,p.id ON CONFLICT DO NOTHING;
ALTER TABLE public.class_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.section_students ENABLE ROW LEVEL SECURITY;
CREATE POLICY class_owner_read ON public.class_sections FOR SELECT TO authenticated USING(teacher_id=auth.uid());
CREATE POLICY roster_owner_read ON public.section_students FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.class_sections c WHERE c.id=class_section_id AND c.teacher_id=auth.uid()));
REVOKE ALL ON public.class_sections,public.section_students FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.class_sections,public.section_students TO authenticated;
GRANT ALL ON public.class_sections,public.section_students TO service_role;
CREATE FUNCTION public.quizna_class_command(p_action text,p_actor uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.class_sections; q public.quizzes; s public.quiz_sections; member jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='teacher') THEN RAISE EXCEPTION USING ERRCODE='QN403'; END IF;
 SELECT * INTO c FROM public.class_sections WHERE id=(p_payload->>'class_section_id')::uuid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='QN404'; END IF;
 IF c.teacher_id IS DISTINCT FROM p_actor THEN RAISE EXCEPTION USING ERRCODE='QN403'; END IF;
 IF p_action='attach' THEN
  SELECT * INTO q FROM public.quizzes WHERE id=(p_payload->>'quiz_id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='QN404'; END IF;
  IF q.teacher_id IS DISTINCT FROM p_actor THEN RAISE EXCEPTION USING ERRCODE='QN403'; END IF;
  SELECT * INTO s FROM public.quiz_sections WHERE quiz_id=q.id AND class_section_id=c.id;
  IF FOUND THEN RETURN to_jsonb(s); END IF;
  INSERT INTO public.quiz_sections(id,quiz_id,class_section_id,name,access_code,created_at)
   VALUES((p_payload->>'id')::uuid,q.id,c.id,c.name,p_payload->>'access_code',clock_timestamp()) RETURNING * INTO s;
  RETURN to_jsonb(s);
 ELSIF p_action='roster' THEN
  IF jsonb_typeof(p_payload->'students') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'students') NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION USING ERRCODE='QN400'; END IF;
  FOR member IN SELECT value FROM jsonb_array_elements(p_payload->'students') LOOP
   IF length(btrim(member->>'full_name')) NOT BETWEEN 1 AND 160 OR member->>'email' IS NULL OR member->>'email' NOT LIKE '%@%' THEN RAISE EXCEPTION USING ERRCODE='QN400'; END IF;
   INSERT INTO public.section_students(class_section_id,full_name,email)
    VALUES(c.id,btrim(member->>'full_name'),lower(btrim(member->>'email')))
    ON CONFLICT(class_section_id,email) DO UPDATE SET full_name=EXCLUDED.full_name;
  END LOOP;
  RETURN '{}'::jsonb;
 ELSIF p_action='remove_student' THEN
  DELETE FROM public.section_students WHERE id=(p_payload->>'student_id')::uuid AND class_section_id=c.id;
  RETURN '{}'::jsonb;
 END IF;
 RAISE EXCEPTION USING ERRCODE='QN400';
END; $$;
REVOKE ALL ON FUNCTION public.quizna_class_command(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.quizna_class_command(text,uuid,jsonb) TO service_role;
COMMIT;
