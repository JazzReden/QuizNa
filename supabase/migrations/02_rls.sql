-- ==============================================================================
-- QuizNa Database Schema Migration 02: Row Level Security (RLS) Policies
-- ==============================================================================

-- Enable RLS on all exposed tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attempt_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_incidents ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- Helper functions for RLS checks
-- ------------------------------------------------------------------------------

-- Get current user role from profiles
CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS TEXT AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Check if user is teacher of a quiz
CREATE OR REPLACE FUNCTION public.is_quiz_teacher(target_quiz_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.quizzes
        WHERE id = target_quiz_id AND teacher_id = auth.uid()
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Check if user is teacher of an attempt
CREATE OR REPLACE FUNCTION public.is_attempt_teacher(target_attempt_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.quiz_attempts qa
        JOIN public.quizzes q ON qa.quiz_id = q.id
        WHERE qa.id = target_attempt_id AND q.teacher_id = auth.uid()
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 1. Profiles Policies
-- ------------------------------------------------------------------------------
CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (id = auth.uid());

CREATE POLICY "Teachers can view profiles of students who attempted their quizzes"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.quiz_attempts qa
            JOIN public.quizzes q ON qa.quiz_id = q.id
            WHERE q.teacher_id = auth.uid() AND qa.student_id = public.profiles.id
        )
    );

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

CREATE POLICY "Users can insert own profile"
    ON public.profiles FOR INSERT
    TO authenticated
    WITH CHECK (id = auth.uid());

-- ------------------------------------------------------------------------------
-- 2. Quizzes Policies
-- ------------------------------------------------------------------------------
CREATE POLICY "Teachers can manage own quizzes"
    ON public.quizzes FOR ALL
    TO authenticated
    USING (teacher_id = auth.uid())
    WITH CHECK (teacher_id = auth.uid());

CREATE POLICY "Students can view published quizzes"
    ON public.quizzes FOR SELECT
    TO authenticated
    USING (status = 'published');

-- ------------------------------------------------------------------------------
-- 3. Quiz Versions Policies
-- ------------------------------------------------------------------------------
CREATE POLICY "Teachers can manage versions of own quizzes"
    ON public.quiz_versions FOR ALL
    TO authenticated
    USING (public.is_quiz_teacher(quiz_id))
    WITH CHECK (public.is_quiz_teacher(quiz_id));

CREATE POLICY "Students can view version assigned to their attempt"
    ON public.quiz_versions FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.quiz_attempts qa
            WHERE qa.quiz_version_id = public.quiz_versions.id AND qa.student_id = auth.uid()
        )
    );

-- ------------------------------------------------------------------------------
-- 4. Questions Policies
-- ------------------------------------------------------------------------------
CREATE POLICY "Teachers can manage questions for own quizzes"
    ON public.questions FOR ALL
    TO authenticated
    USING (public.is_quiz_teacher(quiz_id))
    WITH CHECK (public.is_quiz_teacher(quiz_id));

CREATE POLICY "Students can view questions for quizzes they are actively taking"
    ON public.questions FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.quiz_attempts qa
            WHERE qa.quiz_id = public.questions.quiz_id AND qa.student_id = auth.uid()
        )
    );

-- ------------------------------------------------------------------------------
-- 5. Quiz Attempts Policies
-- ------------------------------------------------------------------------------
CREATE POLICY "Students can view own attempts"
    ON public.quiz_attempts FOR SELECT
    TO authenticated
    USING (student_id = auth.uid());

CREATE POLICY "Teachers can view attempts on own quizzes"
    ON public.quiz_attempts FOR SELECT
    TO authenticated
    USING (public.is_attempt_teacher(id));

CREATE POLICY "Students can create own attempts"
    ON public.quiz_attempts FOR INSERT
    TO authenticated
    WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students can update own active attempts"
    ON public.quiz_attempts FOR UPDATE
    TO authenticated
    USING (student_id = auth.uid())
    WITH CHECK (student_id = auth.uid());

CREATE POLICY "Teachers can update attempts on their quizzes (e.g., grading)"
    ON public.quiz_attempts FOR UPDATE
    TO authenticated
    USING (public.is_attempt_teacher(id));

-- ------------------------------------------------------------------------------
-- 6. Attempt Answers Policies
-- ------------------------------------------------------------------------------
CREATE POLICY "Students can view answers to own attempts"
    ON public.attempt_answers FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.quiz_attempts qa
            WHERE qa.id = public.attempt_answers.attempt_id AND qa.student_id = auth.uid()
        )
    );

CREATE POLICY "Teachers can view and grade answers on own quizzes"
    ON public.attempt_answers FOR ALL
    TO authenticated
    USING (public.is_attempt_teacher(attempt_id));

CREATE POLICY "Students can insert or update answers for active in-progress attempts"
    ON public.attempt_answers FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.quiz_attempts qa
            WHERE qa.id = public.attempt_answers.attempt_id
              AND qa.student_id = auth.uid()
              AND qa.status = 'in_progress'
              AND timezone('utc'::text, now()) <= qa.deadline_at
        )
    );

CREATE POLICY "Students can update answers for active in-progress attempts"
    ON public.attempt_answers FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.quiz_attempts qa
            WHERE qa.id = public.attempt_answers.attempt_id
              AND qa.student_id = auth.uid()
              AND qa.status = 'in_progress'
              AND timezone('utc'::text, now()) <= qa.deadline_at
        )
    );

-- ------------------------------------------------------------------------------
-- 7. Quiz Incidents Policies
-- ------------------------------------------------------------------------------
CREATE POLICY "Students can insert incidents for own attempts"
    ON public.quiz_incidents FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.quiz_attempts qa
            WHERE qa.id = public.quiz_incidents.attempt_id AND qa.student_id = auth.uid()
        )
    );

CREATE POLICY "Students can view incidents for own attempts"
    ON public.quiz_incidents FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.quiz_attempts qa
            WHERE qa.id = public.quiz_incidents.attempt_id AND qa.student_id = auth.uid()
        )
    );

CREATE POLICY "Teachers can view incidents for attempts on own quizzes"
    ON public.quiz_incidents FOR SELECT
    TO authenticated
    USING (public.is_attempt_teacher(attempt_id));
