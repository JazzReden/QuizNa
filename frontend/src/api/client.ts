import { API_URL } from "./config";
import type {
  LiveOptions,
  LivePlan,
  LiveReport,
} from "../components/help/ishi-live";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

class ApiClient {
  listSubjects() {
    return this.request<import("../types").SubjectRoom[]>("/api/subjects");
  }
  copyQuiz(id: string, targetSubjectId: string, requestId: string) {
    return this.request<import("../types").Quiz>(`/api/quizzes/${id}/copy`, {
      method: "POST",
      body: JSON.stringify({
        target_subject_id: targetSubjectId,
        request_id: requestId,
      }),
    });
  }
  getSubject(id: string) {
    return this.request<import("../types").SubjectDetail>(
      `/api/subjects/${id}`,
    );
  }
  enterSubjectQuiz(subjectId: string, quizId: string, code: string) {
    return this.request<{ access_code: string }>(
      `/api/subjects/${subjectId}/quizzes/${quizId}/enter`,
      {
        method: "POST",
        body: JSON.stringify({ code }),
      },
    );
  }
  createSubject(name: string, class_section_id: string) {
    return this.request<import("../types").SubjectRoom>("/api/subjects", {
      method: "POST",
      body: JSON.stringify({ name, class_section_id }),
    });
  }
  joinSubject(code: string) {
    return this.request<{ id: string }>("/api/subjects/join", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
  }
  attachSubjectQuiz(id: string, quiz_id: string) {
    return this.request(`/api/subjects/${id}/quizzes`, {
      method: "POST",
      body: JSON.stringify({ quiz_id }),
    });
  }
  setSubjectLeaderboard(id: string, leaderboard_enabled: boolean) {
    return this.request<import("../types").SubjectRoom>(
      `/api/subjects/${id}/settings`,
      { method: "PUT", body: JSON.stringify({ leaderboard_enabled }) },
    );
  }
  subjectLeaderboard(id: string) {
    return this.request<import("../types").SubjectRanking[]>(
      `/api/subjects/${id}/leaderboard`,
    );
  }

  private cooldowns = new Map<string, { until: number; status: number }>();
  getIshiOptions(signal?: AbortSignal) {
    return this.request<LiveOptions>("/api/assistant/options", {
      signal,
      cache: "no-store",
    });
  }
  getIshiReport(plan: LivePlan, signal?: AbortSignal) {
    const params = new URLSearchParams(
      Object.entries(plan).filter(([, value]) => Boolean(value)),
    );
    return this.request<LiveReport>(`/api/assistant/report?${params}`, {
      signal,
      cache: "no-store",
    });
  }
  private refreshing: Promise<boolean> | null = null;
  private async refreshSession(): Promise<boolean> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      const refresh_token = localStorage.getItem("quizna_refresh");
      if (!refresh_token) return false;
      try {
        const response = await fetch(`${API_URL}/api/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token }),
        });
        if (!response.ok) return false;
        const session = await response.json();
        localStorage.setItem("quizna_token", session.token);
        localStorage.setItem("quizna_refresh", session.refresh_token);
        return true;
      } catch {
        return false;
      }
    })();
    try {
      return await this.refreshing;
    } finally {
      this.refreshing = null;
    }
  }

  private getHeaders(body?: BodyInit | null): HeadersInit {
    const token = localStorage.getItem("quizna_token");
    const headers: Record<string, string> =
      body instanceof FormData ? {} : { "Content-Type": "application/json" };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    retried = false,
  ): Promise<T> {
    const cooldown = this.cooldowns.get(endpoint);
    if (cooldown && cooldown.until > Date.now())
      throw new ApiError(
        "Please wait a moment before retrying.",
        cooldown.status,
      );
    this.cooldowns.delete(endpoint);
    const url = `${API_URL}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.getHeaders(options.body),
        ...(options.headers || {}),
      },
    });

    if (
      response.status === 401 &&
      !retried &&
      !["/api/auth/login", "/api/auth/register", "/api/auth/refresh"].includes(
        endpoint,
      ) &&
      (await this.refreshSession())
    )
      return this.request<T>(endpoint, options, true);
    if (!response.ok) {
      if (response.status === 429 || response.status === 503) {
        const seconds = Number(response.headers.get("Retry-After"));
        const delay =
          Number.isFinite(seconds) && seconds > 0
            ? Math.min(seconds, 120)
            : response.status === 429
              ? 60
              : 5;
        if (this.cooldowns.size >= 64)
          this.cooldowns.delete(this.cooldowns.keys().next().value!);
        this.cooldowns.set(endpoint, {
          until: Date.now() + delay * 1000,
          status: response.status,
        });
      }
      let errorMessage =
        response.status === 401
          ? "Please sign in again."
          : "Unable to complete this request. Please try again.";
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorMessage;
      } catch {
        // Fallback to response text
      }
      throw new ApiError(
        Array.isArray(errorMessage) ? errorMessage.join(" · ") : errorMessage,
        response.status,
      );
    }

    // Handle empty or file responses
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return response.json();
    }
    return response.text() as unknown as T;
  }

  // Auth
  async authOptions() {
    return this.request<{
      passwordLogin: boolean;
      registration: boolean;
      teacherRegistration: boolean;
      demoLogin: boolean;
      localAccounts: boolean;
    }>("/api/auth/options");
  }
  async logout() {
    return this.request<{ success: boolean }>("/api/auth/logout", {
      method: "POST",
      body: JSON.stringify({
        refresh_token: localStorage.getItem("quizna_refresh") || undefined,
      }),
    });
  }

  async login(email: string, password?: string, role?: "teacher" | "student") {
    return this.request<{
      token: string;
      refresh_token?: string;
      profile: any;
    }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, ...(role ? { role } : {}) }),
    });
  }

  async register(
    full_name: string,
    email: string,
    role: string,
    password?: string,
  ) {
    return this.request<{
      token: string;
      refresh_token?: string;
      profile: any;
    } | { confirmation_required: true }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ full_name, email, role, password }),
    });
  }

  async verifyConfirmationSession(token: string) {
    // Never use an existing account's refresh token to validate a new confirmation.
    const response = await fetch(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Please sign in to continue.");
    return response.json() as Promise<import("../types").UserProfile>;
  }

  async getMe() {
    return this.request<any>("/api/auth/me");
  }

  // Quizzes
  async listTeacherQuizzes() {
    return this.request<any[]>("/api/quizzes");
  }

  async getTeacherQuiz(id: string) {
    return this.request<any>(`/api/quizzes/${id}`);
  }

  async getQuizByAccessCode(code: string) {
    return this.request<any>(`/api/quizzes/code/${code}`);
  }

  async createQuiz(data: any) {
    return this.request<any>("/api/quizzes", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateQuiz(id: string, data: any) {
    return this.request<any>(`/api/quizzes/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async publishQuiz(id: string) {
    return this.request<any>(`/api/quizzes/${id}/publish`, {
      method: "POST",
    });
  }

  async deleteQuiz(id: string) {
    return this.request<any>(`/api/quizzes/${id}`, {
      method: "DELETE",
    });
  }

  // Questions
  async listQuestions(quizId: string) {
    return this.request<any[]>(`/api/questions/quiz/${quizId}`);
  }

  async saveDraftQuestions(
    questions: (Omit<import("../types").Question, "id"> & {
      client_question_id: string;
    })[],
  ) {
    return this.request<import("../types").Question[]>(
      "/api/questions/draft-batch",
      { method: "POST", body: JSON.stringify({ questions }) },
    );
  }

  async importQuestions(
    quizId: string,
    importId: string,
    questions: {
      type?: "mcq" | "true_false" | "essay";
      prompt: string;
      points: number;
      options: { id: string; text: string }[];
      correct_answer: string | null;
    }[],
  ) {
    return this.request<import("../types").Question[]>(
      "/api/questions/import",
      {
        method: "POST",
        body: JSON.stringify({
          quiz_id: quizId,
          import_id: importId,
          questions,
        }),
      },
    );
  }

  async createQuestion(data: any) {
    return this.request<any>("/api/questions", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateQuestion(id: string, data: any) {
    return this.request<any>(`/api/questions/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteQuestion(id: string) {
    return this.request<any>(`/api/questions/${id}`, {
      method: "DELETE",
    });
  }

  // Attempts
  async startOrResumeAttempt(accessCode: string) {
    return this.request<any>("/api/attempts/start", {
      method: "POST",
      body: JSON.stringify({ access_code: accessCode }),
    });
  }

  async submitAttempt(attemptId: string, isTimeout = false) {
    return this.request<any>(`/api/attempts/${attemptId}/submit`, {
      method: "POST",
      body: JSON.stringify({ is_timeout: isTimeout }),
    });
  }

  async getStudentPerformance() {
    return this.request<import("../types").StudentPerformance>(
      "/api/attempts/performance",
    );
  }

  async getMyAttempts() {
    return this.request<any[]>("/api/attempts/my");
  }

  async getStudentResult(attemptId: string) {
    return this.request<any>(`/api/attempts/${attemptId}/result`);
  }

  async listQuizAttempts(quizId: string) {
    return this.request<any[]>(`/api/attempts/quiz/${quizId}`);
  }

  async getAttempt(id: string) {
    return this.request<any>(`/api/attempts/${id}`);
  }

  // Answers
  async autosaveAnswer(attemptId: string, questionId: string, answer: any) {
    return this.request<any>(`/api/answers/${attemptId}/save`, {
      method: "POST",
      body: JSON.stringify({ question_id: questionId, answer }),
    });
  }

  async getAttemptAnswers(attemptId: string) {
    return this.request<any[]>(`/api/answers/${attemptId}`);
  }

  // Monitoring
  async reportIncident(attemptId: string, incidentType: string, details?: any) {
    return this.request<any>(`/api/monitoring/${attemptId}/incident`, {
      method: "POST",
      body: JSON.stringify({ incident_type: incidentType, details }),
    });
  }

  async pardonStrike(attemptId: string) {
    return this.request<any>(`/api/monitoring/${attemptId}/pardon`, {
      method: "POST",
    });
  }

  async forceSubmitAttempt(attemptId: string) {
    return this.request<any>(`/api/attempts/${attemptId}/force-submit`, {
      method: "POST",
    });
  }

  async getLiveFeed(quizId: string) {
    return this.request<any>(`/api/monitoring/quiz/${quizId}/live`);
  }

  // Grading
  async confirmScore(
    attemptId: string,
    expectedUpdatedAt: string,
    expectedRevision: number,
  ) {
    return this.request<any>(`/api/grading/attempt/${attemptId}/confirm`, {
      method: "POST",
      body: JSON.stringify({
        expected_updated_at: expectedUpdatedAt,
        expected_revision: expectedRevision,
      }),
    });
  }
  async gradeAnswer(
    answerId: string,
    scoreAwarded: number,
    feedback?: string,
    expectedAnswer?: string,
  ) {
    return this.request<any>(`/api/grading/answer/${answerId}`, {
      method: "POST",
      body: JSON.stringify({
        score_awarded: scoreAwarded,
        teacher_feedback: feedback,
        ...(expectedAnswer !== undefined
          ? { require_ungraded: true, expected_answer: expectedAnswer }
          : {}),
      }),
    });
  }

  async listClasses() {
    return this.request<import("../types").ClassSection[]>("/api/sections");
  }
  async createClass(name: string) {
    return this.request<import("../types").ClassSection>("/api/sections", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  }
  async listRoster(id: string) {
    return this.request<import("../types").RosterStudent[]>(
      `/api/sections/${id}/students`,
    );
  }
  async addRoster(
    id: string,
    students: { full_name: string; email: string }[],
  ) {
    return this.request<import("../types").RosterStudent[]>(
      `/api/sections/${id}/students`,
      { method: "POST", body: JSON.stringify({ students }) },
    );
  }
  async removeRosterStudent(id: string, studentId: string) {
    return this.request(`/api/sections/${id}/students/${studentId}`, {
      method: "DELETE",
    });
  }
  async attachClass(quizId: string, classId: string) {
    return this.request<import("../types").QuizSection>(
      `/api/sections/quiz/${quizId}/attach`,
      { method: "POST", body: JSON.stringify({ class_section_id: classId }) },
    );
  }
  async getClassList(quizId: string, sectionId = "") {
    return this.request<import("../types").Leaderboard>(
      `/api/reports/quiz/${quizId}/class-list${sectionId ? "?section_id=" + encodeURIComponent(sectionId) : ""}`,
    );
  }
  async listSections(quizId: string) {
    return this.request<import("../types").QuizSection[]>(
      `/api/sections/quiz/${quizId}`,
    );
  }
  async createSection(quizId: string, name: string) {
    return this.request<import("../types").QuizSection>(
      `/api/sections/quiz/${quizId}`,
      { method: "POST", body: JSON.stringify({ name }) },
    );
  }
  async assignSection(attemptId: string, sectionId: string | null) {
    return this.request(`/api/sections/attempt/${attemptId}`, {
      method: "PUT",
      body: JSON.stringify({ section_id: sectionId }),
    });
  }
  async getLeaderboard(quizId: string, sectionId = "") {
    return this.request<import("../types").Leaderboard>(
      `/api/reports/quiz/${quizId}/leaderboard${sectionId ? "?section_id=" + encodeURIComponent(sectionId) : ""}`,
    );
  }
  async downloadScorebook(
    quizId: string,
    sectionId = "",
    status = "all",
  ): Promise<Blob> {
    const csv = await this.request<string>(
      `/api/reports/quiz/${quizId}/scorebook.csv?${new URLSearchParams({ ...(sectionId ? { section_id: sectionId } : {}), status })}`,
    );
    return new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  }

  async getSectionGradebook(classId: string) {
    return this.request<import("../types").SectionGradebook>(
      `/api/reports/section/${encodeURIComponent(classId)}/gradebook`,
    );
  }
  async downloadGradebook(classId: string): Promise<Blob> {
    const csv = await this.request<string>(
      `/api/reports/section/${encodeURIComponent(classId)}/gradebook.csv`,
    );
    return new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  }
  async getQuestionAnalysis(quizId: string, sectionId = "") {
    return this.request<import("../types").QuestionAnalysis>(
      `/api/reports/quiz/${encodeURIComponent(quizId)}/analysis?${new URLSearchParams(sectionId ? { section_id: sectionId } : {})}`,
    );
  }

  async listPaperSheets(quizId: string) {
    return this.request<
      {
        id: string;
        student: string;
        section: string;
        attempt_id: string | null;
        is_current_edition?: boolean;
      }[]
    >(`/api/paper/quiz/${quizId}`);
  }
  async getPaperSheet(id: string) {
    return this.request<import("../types").PaperSheet>(
      `/api/paper/sheet/${id}`,
    );
  }
  async issuePaper(quizId: string, section_id: string, student_email: string) {
    return this.request<import("../types").PaperSheet>(
      `/api/paper/quiz/${quizId}/issue`,
      { method: "POST", body: JSON.stringify({ section_id, student_email }) },
    );
  }
  async preparePaperSection(
    quizId: string,
    section_id: string,
    paper_format?: "a4" | "long_bond",
  ) {
    return this.request<{
      sheet_ids: string[];
      skipped: { student: string; reason: string }[];
    }>(`/api/paper/quiz/${quizId}/prepare-section`, {
      method: "POST",
      body: JSON.stringify({ section_id, paper_format }),
    });
  }
  async resolvePaper(code: string) {
    return this.request<{ sheet: import("../types").PaperSheet; page: number }>(
      `/api/paper/resolve`,
      { method: "POST", body: JSON.stringify({ code }) },
    );
  }
  async savePaper(
    id: string,
    answers: { question_id: string; answer: string | null }[],
  ) {
    return this.request<import("../types").QuizAttempt>(
      `/api/paper/sheet/${id}/save`,
      { method: "POST", body: JSON.stringify({ reviewed: true, answers }) },
    );
  }

  async paperAiOptions() {
    return this.request<{
      enabled: boolean;
      provider?: string | null;
      disclosure?: string;
    }>("/api/paper-ai/options");
  }
  async suggestPaperEssays(sheetId: string, pageIndex: number, images: Blob[]) {
    const body = new FormData();
    body.append("sheet_id", sheetId);
    body.append("page_index", String(pageIndex));
    images.forEach((image, index) =>
      body.append("images", image, `essay-${index}.png`),
    );
    return this.request<{
      essays: import("../utils/essay-ai-review").EssaySuggestion[];
    }>("/api/paper-ai/suggest", { method: "POST", body });
  }
  // Reports
  async getQuizStats(quizId: string) {
    return this.request<any>(`/api/reports/quiz/${quizId}/stats`);
  }

  async downloadCsv(
    quizId: string,
    sectionId = "",
    status = "all",
  ): Promise<Blob> {
    const csv = await this.request<string>(
      `/api/reports/quiz/${quizId}/csv?${new URLSearchParams({ ...(sectionId ? { section_id: sectionId } : {}), status })}`,
    );
    return new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  }
}

export const api = new ApiClient();
