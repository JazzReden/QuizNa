export type UserRole = 'teacher' | 'student';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export type QuizStatus = 'draft' | 'published' | 'archived';

export interface Quiz {
  require_access_code?: boolean;
  subject?: string | null;
  paper_has_unpublished_changes?: boolean;
  paper_published_question_count?: number;
  paper_submitted_count?: number;
  paper_graded_count?: number;
  exam_format?: 'online' | 'paper';
  id: string;
  teacher_id: string;
  title: string;
  description?: string;
  instructions?: string;
  access_code: string;
  time_limit_minutes: number;
  max_attempts: number;
  randomize_questions: boolean;
  randomize_options: boolean;
  available_from?: string;
  available_until?: string;
  release_scores_immediately: boolean;
  release_answers_immediately: boolean;
  status: QuizStatus;
  version: number;
  created_at: string;
  updated_at: string;
  questions?: Question[];
}

export type QuestionType = 'mcq' | 'true_false' | 'short_answer' | 'essay';

export interface QuestionOption {
  id: string;
  text: string;
  is_correct?: boolean;
}

export interface Question {
  id: string;
  quiz_id: string;
  type: QuestionType;
  prompt: string;
  explanation?: string;
  points: number;
  order_index: number;
  options?: QuestionOption[];
  correct_answer?: any; // Kept private from students during attempt
  rubric?: string;      // Kept private from students during attempt
  created_at: string;
  updated_at: string;
}

// Student sanitized version of question
export interface StudentQuestionView {
  id: string;
  quiz_id: string;
  type: QuestionType;
  prompt: string;
  points: number;
  order_index: number;
  options?: Array<{ id: string; text: string }>;
}

export type AttemptStatus = 'in_progress' | 'submitted' | 'timed_out' | 'terminated_violation';

export interface ClassSection {
  id: string; teacher_id: string; name: string; created_at: string;
}
export interface RosterStudent {
  id: string; class_section_id: string; full_name: string; email: string; created_at: string;
}
export interface QuizSection {
  class_section_id?: string;
  id: string; quiz_id: string; name: string; access_code: string; created_at: string;
}

export interface QuizAttempt {
  paper_sheet_id?: string;
  section_id?: string | null;
  section_name?: string;
  id: string;
  quiz_id: string;
  quiz_version_id?: string;
  student_id: string;
  attempt_number: number;
  status: AttemptStatus;
  started_at: string;
  deadline_at: string;
  submitted_at?: string;
  score?: number;
  max_score: number;
  is_graded: boolean;
  score_revision?: number;
  score_confirmed_at?: string | null;
  score_confirmed_by?: string | null;
  warning_count: number;
  question_order: string[]; // Ordered list of question IDs
  created_at: string;
  updated_at: string;
  student_profile?: UserProfile;
  quiz?: Partial<Quiz>;
}

export interface AttemptAnswer {
  id: string;
  attempt_id: string;
  question_id: string;
  answer: any;
  score_awarded?: number;
  teacher_feedback?: string;
  is_manually_graded: boolean;
  updated_at: string;
}

export type IncidentType = 'tab_hidden' | 'window_blur' | 'fullscreen_exit';

export interface QuizIncident {
  id: string;
  attempt_id: string;
  incident_type: IncidentType;
  occurred_at: string;
  warning_number: number;
  details?: Record<string, any>;
  created_at: string;
}

export interface QuizVersion {
  id: string;
  quiz_id: string;
  version_number: number;
  snapshot_data: {
    exam_format?: 'online' | 'paper';
    title: string;
    instructions?: string;
    time_limit_minutes: number;
    max_attempts: number;
    randomize_questions: boolean;
    randomize_options: boolean;
    questions: Question[];
  };
  created_at: string;
}
