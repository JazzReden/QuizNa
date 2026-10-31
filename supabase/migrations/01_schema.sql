-- ==============================================================================
-- QuizNa Database Schema Migration 01: Core Tables, Constraints, and Indexes
-- ==============================================================================

-- UUIDv4 uses PostgreSQL 13+ core; no extension schema is required.

-- 1. Profiles Table (linked with Supabase Auth users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Index for role lookup
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- 2. Quizzes Table
CREATE TABLE IF NOT EXISTS public.quizzes (
    id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
    teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    instructions TEXT,
    access_code VARCHAR(12) NOT NULL UNIQUE,
    time_limit_minutes INT NOT NULL DEFAULT 30 CHECK (time_limit_minutes > 0),
    max_attempts INT NOT NULL DEFAULT 1 CHECK (max_attempts > 0),
    randomize_questions BOOLEAN NOT NULL DEFAULT false,
    randomize_options BOOLEAN NOT NULL DEFAULT false,
    available_from TIMESTAMPTZ,
    available_until TIMESTAMPTZ,
    release_scores_immediately BOOLEAN NOT NULL DEFAULT false,
    release_answers_immediately BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indexes for quizzes
CREATE INDEX IF NOT EXISTS idx_quizzes_teacher ON public.quizzes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_access_code ON public.quizzes(access_code);
CREATE INDEX IF NOT EXISTS idx_quizzes_status ON public.quizzes(status);

-- 3. Quiz Versions Table (Freezes quiz structure when attempts are created)
CREATE TABLE IF NOT EXISTS public.quiz_versions (
    id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
    quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
    version_number INT NOT NULL,
    snapshot_data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_quiz_version UNIQUE(quiz_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_quiz_versions_quiz ON public.quiz_versions(quiz_id);

-- 4. Questions Table
CREATE TABLE IF NOT EXISTS public.questions (
    id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
    quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('mcq', 'true_false', 'short_answer', 'essay')),
    prompt TEXT NOT NULL,
    explanation TEXT,
    points NUMERIC(6, 2) NOT NULL DEFAULT 1.0 CHECK (points >= 0),
    order_index INT NOT NULL DEFAULT 0,
    options JSONB, -- Array of { id: string, text: string, is_correct?: boolean }
    correct_answer JSONB, -- Objective answer representation
    rubric TEXT, -- Guidance for manual grading of essays
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_questions_quiz ON public.questions(quiz_id, order_index);

-- 5. Quiz Attempts Table
CREATE TABLE IF NOT EXISTS public.quiz_attempts (
    id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
    quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
    quiz_version_id UUID REFERENCES public.quiz_versions(id) ON DELETE SET NULL,
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    attempt_number INT NOT NULL DEFAULT 1 CHECK (attempt_number > 0),
    status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted', 'timed_out', 'terminated_violation')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    deadline_at TIMESTAMPTZ NOT NULL,
    submitted_at TIMESTAMPTZ,
    score NUMERIC(6, 2),
    max_score NUMERIC(6, 2) NOT NULL DEFAULT 0,
    is_graded BOOLEAN NOT NULL DEFAULT false,
    warning_count INT NOT NULL DEFAULT 0 CHECK (warning_count >= 0 AND warning_count <= 3),
    question_order JSONB, -- Array of question IDs assigned to this student attempt
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_student_attempt UNIQUE(quiz_id, student_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS idx_attempts_quiz_student ON public.quiz_attempts(quiz_id, student_id);
CREATE INDEX IF NOT EXISTS idx_attempts_status ON public.quiz_attempts(status);
CREATE INDEX IF NOT EXISTS idx_attempts_deadline ON public.quiz_attempts(deadline_at);

-- 6. Attempt Answers Table
CREATE TABLE IF NOT EXISTS public.attempt_answers (
    id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
    attempt_id UUID NOT NULL REFERENCES public.quiz_attempts(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    answer JSONB, -- Value student provided
    score_awarded NUMERIC(6, 2),
    teacher_feedback TEXT,
    is_manually_graded BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_attempt_question UNIQUE(attempt_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_answers_attempt ON public.attempt_answers(attempt_id);

-- 7. Quiz Incidents Table (Monitoring telemetry)
CREATE TABLE IF NOT EXISTS public.quiz_incidents (
    id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
    attempt_id UUID NOT NULL REFERENCES public.quiz_attempts(id) ON DELETE CASCADE,
    incident_type TEXT NOT NULL CHECK (incident_type IN ('tab_hidden', 'window_blur', 'fullscreen_exit')),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    warning_number INT NOT NULL CHECK (warning_number BETWEEN 1 AND 3),
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_incidents_attempt ON public.quiz_incidents(attempt_id, occurred_at);

-- Trigger for auto-updating updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_profiles_updated_at ON public.profiles;
CREATE TRIGGER tr_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_quizzes_updated_at ON public.quizzes;
CREATE TRIGGER tr_quizzes_updated_at BEFORE UPDATE ON public.quizzes FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_questions_updated_at ON public.questions;
CREATE TRIGGER tr_questions_updated_at BEFORE UPDATE ON public.questions FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_quiz_attempts_updated_at ON public.quiz_attempts;
CREATE TRIGGER tr_quiz_attempts_updated_at BEFORE UPDATE ON public.quiz_attempts FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_attempt_answers_updated_at ON public.attempt_answers;
CREATE TRIGGER tr_attempt_answers_updated_at BEFORE UPDATE ON public.attempt_answers FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
