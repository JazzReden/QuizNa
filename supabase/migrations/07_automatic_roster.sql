BEGIN;
-- Enrollment commits with the new attempt. The section/email uniqueness constraint
-- makes simultaneous starts across different quizzes safe without updating roster names.
CREATE FUNCTION public.quizna_enroll_started_student()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE class_id uuid;
BEGIN
 IF NEW.section_id IS NULL THEN RETURN NEW; END IF;
 SELECT s.class_section_id INTO class_id FROM public.quiz_sections s
 WHERE s.id=NEW.section_id AND s.quiz_id=NEW.quiz_id;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='QN403',MESSAGE='Invalid section'; END IF;
 IF class_id IS NULL THEN RETURN NEW; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.class_sections c JOIN public.quizzes q ON q.teacher_id=c.teacher_id
   WHERE c.id=class_id AND q.id=NEW.quiz_id) THEN
   RAISE EXCEPTION USING ERRCODE='QN403',MESSAGE='Invalid section owner';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=NEW.student_id AND role='student') THEN
   RAISE EXCEPTION USING ERRCODE='QN403',MESSAGE='Student account required';
 END IF;
 INSERT INTO public.section_students(class_section_id,full_name,email)
 SELECT class_id,left(btrim(p.full_name),160),lower(btrim(p.email)) FROM public.profiles p WHERE p.id=NEW.student_id
 ON CONFLICT(class_section_id,email) DO NOTHING;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.quizna_enroll_started_student() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER enroll_started_student AFTER INSERT ON public.quiz_attempts
 FOR EACH ROW EXECUTE FUNCTION public.quizna_enroll_started_student();
COMMIT;
