export type UserRole = "teacher" | "student";

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  avatar_url?: string;
}

export type QuizStatus = "draft" | "published" | "archived";

export interface Quiz {
  require_access_code?: boolean;
  subject?: string | null;
  paper_has_unpublished_changes?: boolean;
  paper_published_question_count?: number;
  paper_submitted_count?: number;
  paper_graded_count?: number;
  exam_format?: "online" | "paper";
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

export type QuestionType = "mcq" | "true_false" | "short_answer" | "essay";

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
  correct_answer?: any;
  rubric?: string;
  created_at?: string;
}

export interface StudentQuestionView {
  id: string;
  quiz_id: string;
  type: QuestionType;
  prompt: string;
  points: number;
  order_index: number;
  options?: Array<{ id: string; text: string }>;
}

export type AttemptStatus =
  "in_progress" | "submitted" | "timed_out" | "terminated_violation";

export interface QuizAttempt {
  section_id?: string | null;
  section_name?: string;
  id: string;
  quiz_id: string;
  student_id: string;
  attempt_number: number;
  status: AttemptStatus;
  started_at: string;
  deadline_at: string;
  submitted_at?: string;
  score?: number;
  max_score: number;
  is_graded: boolean;
  warning_count: number;
  question_order: string[];
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

export type IncidentType = "tab_hidden" | "window_blur" | "fullscreen_exit";

export interface QuizIncident {
  id: string;
  attempt_id: string;
  incident_type: IncidentType;
  occurred_at: string;
  warning_number: number;
  details?: Record<string, any>;
}

export interface StudentAttemptContext {
  attempt: QuizAttempt;
  questions: StudentQuestionView[];
  savedAnswers: Record<string, any>;
  remainingSeconds: number;
  isResumed: boolean;
}

export interface QuizStatistics {
  quizId: string;
  totalAttempts: number;
  completedCount: number;
  submittedCount: number;
  timedOutCount: number;
  terminatedCount: number;
  maxPossibleScore: number;
  avgScore: number;
  medianScore: number;
  highestScore: number;
  lowestScore: number;
  totalWarnings: number;
}

export interface ClassSection {
  id: string;
  teacher_id: string;
  name: string;
  created_at: string;
  student_count?: number;
}
export interface RosterStudent {
  id: string;
  class_section_id: string;
  full_name: string;
  email: string;
  created_at: string;
  last_name?: string;
}
export interface QuizSection {
  class_section_id?: string;
  id: string;
  quiz_id: string;
  name: string;
  access_code: string;
  created_at: string;
}
export interface StudentScore {
  participation?: "submitted" | "in_progress" | "not_started";
  rosterMember?: boolean;
  studentId: string;
  studentName: string;
  studentLastName: string;
  studentEmail: string;
  sectionId: string | null;
  sectionName: string;
  attemptId: string;
  reviewAttemptId: string;
  attemptNumber: number;
  attemptCount: number;
  pendingAttempts: number;
  score: number | null;
  maxScore: number;
  percentage: number | null;
  rank: number | null;
  status: string;
  isGraded: boolean;
}
export interface Leaderboard {
  summary?: { submitted: number; in_progress: number; not_started: number };
  quiz: { id: string; title: string; status: string };
  sections: QuizSection[];
  rows: StudentScore[];
  pendingCount: number;
}

export interface SectionGradebook {
  section: { id: string; name: string };
  quizzes: { id: string; title: string }[];
  rows: {
    name: string;
    email: string;
    onRoster: boolean;
    total: number | null;
    outOf: number;
    gradedCount: number;
    cells: {
      quizId: string;
      score: number | null;
      maxScore: number | null;
      status: string;
      pending: boolean;
      awaitingConfirmation?: boolean;
      scoreAttemptId: string | null;
      gradingAttemptId: string | null;
    }[];
  }[];
}
export interface QuestionAnalysis {
  quiz: { id: string; title: string };
  sections: QuizSection[];
  submittedCount: number;
  rows: {
    id: string;
    version: number;
    order: number;
    prompt: string;
    type: string;
    points: number;
    responses: number;
    graded: number;
    pending: number;
    unanswered: number;
    fullCredit: number;
    averagePercent: number | null;
    fullCreditPercent: number | null;
    commonWrong: { answer: string; count: number }[];
  }[];
}

export interface PaperRow {
  questionId: string;
  number: number;
  type: string;
  /** Number-label position; omitted by older printed layouts. */
  x?: number;
  y: number;
  height: number;
  width?: number;
  showOptionLabels?: boolean;
  options: { id: string; label: string; x: number }[];
}
export interface PaperPage {
  index: number;
  width?: number;
  height?: number;
  rows: PaperRow[];
}
export interface PaperSheet {
  id: string;
  quiz_id: string;
  quiz_version_id: string;
  student_id: string;
  section_id: string;
  token: string;
  attempt_id?: string;
  created_at: string;
  layout: {
    subject?: string;
    revision: 1 | 2 | 3;
    paperSize?: "a4" | "long_bond";
    title: string;
    instructions: string;
    timeLimit: number;
    student: string;
    section: string;
    questions: StudentQuestionView[];
    pages: PaperPage[];
  };
}

export interface StudentPerformanceQuiz {
  id: string;
  title: string;
  format: "online" | "paper";
  subject: string | null;
  state: "graded" | "awaiting_grading" | "awaiting_release" | "in_progress";
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  attemptId: string;
  completedAt: string | null;
}
export interface StudentPerformance {
  quizCount: number;
  gradedCount: number;
  percentage: number | null;
  subjects: {
    subject: string | null;
    quizzes: StudentPerformanceQuiz[];
    gradedCount: number;
    earned: number;
    possible: number;
    percentage: number | null;
  }[];
}

export interface SubjectRoom {
  id: string;
  teacher_id: string;
  class_section_id: string;
  name: string;
  access_code: string;
  leaderboard_enabled: boolean;
  created_at: string;
  section_name?: string;
  quiz_count?: number;
  quiz_ids?: string[];
}
export interface SubjectQuizView {
  can_start?: boolean;
  id: string;
  title: string;
  exam_format: "online" | "paper";
  status: string;
  access_code?: string;
  require_access_code?: boolean;
  available_from?: string;
  available_until?: string;
  time_limit_minutes: number;
  attempts: QuizAttempt[];
}
export interface SubjectDetail extends SubjectRoom {
  quizzes: SubjectQuizView[];
}
export interface SubjectRanking {
  rank: number;
  student_id: string;
  name: string;
  score: number;
  max_score: number;
}
