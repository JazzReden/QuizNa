BEGIN;
CREATE TABLE public.subject_rooms (
 id uuid PRIMARY KEY, teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 class_section_id uuid NOT NULL REFERENCES public.class_sections(id) ON DELETE CASCADE,
 name varchar(120) NOT NULL CHECK(length(btrim(name))>0),access_code varchar(16) NOT NULL UNIQUE CHECK(access_code ~ '^SUB-[A-F0-9]{12}$'),
 leaderboard_enabled boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(id,class_section_id)
);
CREATE UNIQUE INDEX subject_section_name ON public.subject_rooms(teacher_id,class_section_id,lower(btrim(name)));
CREATE TABLE public.subject_members (
 id uuid PRIMARY KEY,subject_id uuid NOT NULL REFERENCES public.subject_rooms(id) ON DELETE CASCADE,
 student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(subject_id,student_id)
);
CREATE INDEX student_subject ON public.subject_members(student_id,subject_id);
CREATE TABLE public.subject_quizzes (
 id uuid PRIMARY KEY,subject_id uuid NOT NULL,quiz_id uuid NOT NULL,class_section_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(subject_id,class_section_id) REFERENCES public.subject_rooms(id,class_section_id) ON DELETE CASCADE,
 FOREIGN KEY(quiz_id,class_section_id) REFERENCES public.quiz_sections(quiz_id,class_section_id) ON DELETE CASCADE,UNIQUE(subject_id,quiz_id)
);
CREATE INDEX quiz_subject ON public.subject_quizzes(quiz_id,subject_id);
ALTER TABLE public.subject_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subject_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subject_quizzes ENABLE ROW LEVEL SECURITY;
-- Browser writes go through the authenticated Nest API. No public code lookup or roster enumeration.
CREATE POLICY subject_teacher_read ON public.subject_rooms FOR SELECT TO authenticated USING(teacher_id=auth.uid());
CREATE POLICY subject_member_self ON public.subject_members FOR SELECT TO authenticated USING(student_id=auth.uid());
CREATE POLICY subject_student_read ON public.subject_rooms FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.subject_members m WHERE m.subject_id=subject_rooms.id AND m.student_id=auth.uid()));
CREATE POLICY subject_members_teacher ON public.subject_members FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.subject_rooms s WHERE s.id=subject_id AND s.teacher_id=auth.uid()));
-- Avoid policy recursion by using a narrowly scoped helper for teacher ownership.
DROP POLICY subject_members_teacher ON public.subject_members;
CREATE FUNCTION public.quizna_owns_subject(p_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM public.subject_rooms WHERE id=p_id AND teacher_id=auth.uid()) $$;
REVOKE ALL ON FUNCTION public.quizna_owns_subject(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.quizna_owns_subject(uuid) TO authenticated;
CREATE POLICY subject_members_teacher ON public.subject_members FOR SELECT TO authenticated USING(public.quizna_owns_subject(subject_id));
CREATE POLICY subject_quiz_read ON public.subject_quizzes FOR SELECT TO authenticated USING(public.quizna_owns_subject(subject_id) OR EXISTS(SELECT 1 FROM public.subject_members m WHERE m.subject_id=subject_quizzes.subject_id AND m.student_id=auth.uid()));
REVOKE ALL ON public.subject_rooms,public.subject_members,public.subject_quizzes FROM anon,authenticated;
GRANT SELECT ON public.subject_rooms,public.subject_members,public.subject_quizzes TO authenticated;
GRANT ALL ON public.subject_rooms,public.subject_members,public.subject_quizzes TO service_role;
CREATE FUNCTION public.quizna_join_subject(p_subject uuid,p_student uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.subject_rooms; p public.profiles;
BEGIN
 SELECT * INTO r FROM public.subject_rooms WHERE id=p_subject FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Subject unavailable'; END IF;
 SELECT * INTO p FROM public.profiles WHERE id=p_student AND role='student';
 IF NOT FOUND THEN RAISE EXCEPTION 'Student required'; END IF;
 INSERT INTO public.subject_members(id,subject_id,student_id) VALUES(gen_random_uuid(),r.id,p.id) ON CONFLICT(subject_id,student_id) DO NOTHING;
 INSERT INTO public.section_students(id,class_section_id,full_name,email) VALUES(gen_random_uuid(),r.class_section_id,left(p.full_name,160),lower(btrim(p.email))) ON CONFLICT(class_section_id,email) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.quizna_join_subject(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.quizna_join_subject(uuid,uuid) TO service_role;
INSERT INTO public.subject_rooms(id,teacher_id,class_section_id,name,access_code,created_at)
 SELECT gen_random_uuid(),q.teacher_id,s.class_section_id,min(btrim(q.subject)),'SUB-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),min(q.created_at)
 FROM public.quizzes q JOIN public.quiz_sections s ON s.quiz_id=q.id WHERE s.class_section_id IS NOT NULL AND btrim(coalesce(q.subject,''))<>'' GROUP BY q.teacher_id,s.class_section_id,lower(btrim(q.subject));
INSERT INTO public.subject_quizzes(id,subject_id,quiz_id,class_section_id,created_at)
 SELECT gen_random_uuid(),r.id,q.id,r.class_section_id,q.created_at FROM public.subject_rooms r JOIN public.quizzes q ON q.teacher_id=r.teacher_id AND lower(btrim(q.subject))=lower(r.name) JOIN public.quiz_sections s ON s.quiz_id=q.id AND s.class_section_id=r.class_section_id;
INSERT INTO public.subject_members(id,subject_id,student_id)
 SELECT gen_random_uuid(),r.id,p.id FROM public.subject_rooms r JOIN public.section_students s ON s.class_section_id=r.class_section_id JOIN public.profiles p ON lower(p.email)=lower(s.email) AND p.role='student' ON CONFLICT(subject_id,student_id) DO NOTHING;
COMMIT;
