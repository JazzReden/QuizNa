-- Service-only atomic quiz copying. Browser roles cannot execute this function.
BEGIN;
CREATE OR REPLACE FUNCTION public.quizna_copy_quiz(p_source uuid,p_teacher uuid,p_target uuid,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.quizzes; t public.subject_rooms; c public.class_sections; result public.quizzes;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 SELECT * INTO s FROM public.quizzes WHERE id=p_source AND teacher_id=p_teacher FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_teacher AND role='teacher') THEN RAISE EXCEPTION 'Teacher required' USING ERRCODE='42501'; END IF;
 SELECT * INTO t FROM public.subject_rooms WHERE id=p_target AND teacher_id=p_teacher FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO c FROM public.class_sections WHERE id=t.class_section_id AND teacher_id=p_teacher FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.quiz_sections WHERE quiz_id=s.id AND class_section_id=c.id) THEN RAISE EXCEPTION 'Choose another section'; END IF;
 SELECT * INTO result FROM public.quizzes WHERE id=p_id;
 IF FOUND THEN
   IF result.teacher_id<>p_teacher OR NOT EXISTS(SELECT 1 FROM public.subject_quizzes WHERE quiz_id=p_id AND subject_id=p_target) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
   RETURN to_jsonb(result);
 END IF;
 INSERT INTO public.quizzes(id,teacher_id,title,subject,description,instructions,access_code,exam_format,require_access_code,time_limit_minutes,max_attempts,randomize_questions,randomize_options,release_scores_immediately,release_answers_immediately,status,version)
 VALUES(p_id,p_teacher,s.title,t.name,s.description,s.instructions,upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),s.exam_format,s.require_access_code,s.time_limit_minutes,s.max_attempts,s.randomize_questions,s.randomize_options,false,false,'draft',1) RETURNING * INTO result;
 INSERT INTO public.questions(quiz_id,type,prompt,explanation,points,order_index,options,correct_answer,rubric)
 SELECT p_id,type,prompt,explanation,points,order_index,options,correct_answer,rubric FROM public.questions WHERE quiz_id=p_source;
 INSERT INTO public.quiz_sections(quiz_id,class_section_id,name,access_code) VALUES(p_id,c.id,c.name,'S-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)));
 INSERT INTO public.subject_quizzes(id,subject_id,quiz_id,class_section_id) VALUES(gen_random_uuid(),t.id,p_id,c.id);
 RETURN to_jsonb(result);
END $$;
REVOKE ALL ON FUNCTION public.quizna_copy_quiz(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.quizna_copy_quiz(uuid,uuid,uuid,uuid) TO service_role;

COMMIT;
