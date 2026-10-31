import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import {
  Question,
  QuizAttempt,
  StudentQuestionView,
  UserProfile,
} from "../../common/types";
import { DatabaseService } from "../../database/database.service";
import { GradingService } from "../grading/grading.service";
import { buildStudentPerformance } from "./student-performance";

@Injectable()
export class AttemptsService implements OnModuleInit, OnModuleDestroy {
  private expiryTimer?: ReturnType<typeof setInterval>;
  private sweeping = false;
  private readonly logger = new Logger(AttemptsService.name);

  onModuleInit() {
    this.expiryTimer = setInterval(() => void this.expireDueAttempts(), 15000);
    this.expiryTimer.unref();
    void this.expireDueAttempts();
  }
  onModuleDestroy() {
    if (this.expiryTimer) clearInterval(this.expiryTimer);
  }

  async expireDueAttempts() {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      if (this.db.isLive) await this.db.command("expire", null, {});
      else
        for (const attempt of await this.db.listExpiredAttempts())
          await this.finalizeAttempt(attempt.id, "timed_out");
    } catch (error) {
      this.logger.error("Expiry sweep failed; will retry");
    } finally {
      this.sweeping = false;
    }
  }

  private async studentView(attempt: QuizAttempt): Promise<QuizAttempt> {
    const quiz = await this.db.getQuizById(attempt.quiz_id);
    return {
      ...attempt,
      score:
        quiz?.release_scores_immediately && attempt.status !== "in_progress"
          ? attempt.score
          : undefined,
      quiz: undefined,
      student_profile: undefined,
    };
  }

  constructor(
    private db: DatabaseService,
    private gradingService: GradingService,
  ) {}

  private displayAnswer(question: Question, value: unknown): unknown {
    if (value === undefined || value === null) return null;
    if (Array.isArray(value))
      return value.map((item) => this.displayAnswer(question, item));
    if (question.type === "true_false" && typeof value === "boolean")
      return value ? "True" : "False";
    return question.options?.find((o) => o.id === value)?.text ?? value;
  }

  private orderKey(value: string): number {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++)
      hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
    return hash >>> 0;
  }

  // Shuffle array using Fisher-Yates
  private shuffle<T>(array: T[]): T[] {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Student starts or resumes an attempt
  async startOrResumeAttempt(
    student: UserProfile,
    accessCode: string,
  ): Promise<{
    attempt: QuizAttempt;
    questions: StudentQuestionView[];
    savedAnswers: Record<string, any>;
    remainingSeconds: number;
    section_name?: string;
    isResumed: boolean;
  }> {
    if (student.role !== "student")
      throw new ForbiddenException("Student account required");
    if (this.db.isLive) {
      const result = await this.db.command<{
        attempt: QuizAttempt;
        isResumed: boolean;
      }>("start", student.id, { access_code: accessCode });
      return this.getAttemptContext(result.attempt, result.isResumed);
    }
    const resolved = await this.db.resolveQuizAccess(accessCode);
    return this.db.withLock(
      `start:${student.id}:${resolved.quiz?.id || accessCode}`,
      () => this.startDemoAttempt(student, accessCode),
    );
  }

  private async startDemoAttempt(student: UserProfile, accessCode: string) {
    const { quiz, section } = await this.db.resolveQuizAccess(accessCode);
    if (!quiz) throw new NotFoundException("Quiz not found or not published");
    if (quiz.exam_format === "paper")
      throw new BadRequestException("This exam is taken on paper.");
    const now = new Date();

    // 1. Check if student already has an active in_progress attempt
    const existingAttempts = await this.db.listAttemptsByStudent(student.id);
    const quizAttempts = existingAttempts.filter((a) => a.quiz_id === quiz.id);
    if (
      quizAttempts.some((a) => (a.section_id || null) !== (section?.id || null))
    )
      throw new ConflictException(
        "Use the code for your original section. Ask your teacher if it needs correcting.",
      );

    const activeAttempt = quizAttempts.find((a) => a.status === "in_progress");
    if (activeAttempt) {
      const deadline = new Date(activeAttempt.deadline_at);
      if (now >= deadline) {
        // Expired on reconnect - finalize
        const expired = await this.finalizeAttempt(
          activeAttempt.id,
          "timed_out",
        );
        if (this.db.isMysql) return this.getAttemptContext(expired, true);
        activeAttempt.status = "timed_out";
      } else {
        // Resume existing attempt
        return this.getAttemptContext(activeAttempt, true);
      }
    }

    if (quiz.status !== "published")
      throw new NotFoundException("Quiz not found or not published");
    if (quiz.available_from && new Date(quiz.available_from) > now)
      throw new BadRequestException("Quiz is not yet available");
    if (quiz.available_until && new Date(quiz.available_until) <= now)
      throw new BadRequestException("Quiz deadline has passed");

    // 2. Check maximum attempts limit
    const finishedAttempts = quizAttempts.filter(
      (a) => a.status !== "in_progress",
    );
    if (finishedAttempts.length >= quiz.max_attempts) {
      throw new ConflictException(
        `You have reached the maximum allowed attempts (${quiz.max_attempts}) for this quiz.`,
      );
    }

    // 3. Compute server-enforced deadline
    const versionSnapshot = await this.db.getQuizVersion(quiz.id, quiz.version);
    if (!versionSnapshot)
      throw new BadRequestException("Publish this quiz before starting");
    const frozen = versionSnapshot.snapshot_data;
    const timeLimitMs = frozen.time_limit_minutes * 60 * 1000;
    const computedDeadlineMs = now.getTime() + timeLimitMs;
    let finalDeadline = new Date(computedDeadlineMs);

    if (quiz.available_until) {
      const quizEnd = new Date(quiz.available_until);
      if (quizEnd < finalDeadline) {
        finalDeadline = quizEnd;
      }
    }

    // 4. Fetch questions and handle ordering/shuffling
    let questions = structuredClone(frozen.questions);
    if (questions.length === 0) {
      throw new BadRequestException("Quiz does not have any questions");
    }

    if (frozen.randomize_questions) {
      questions = this.shuffle(questions);
    }

    const questionOrder = questions.map((q) => q.id);
    const maxScore = questions.reduce((sum, q) => sum + Number(q.points), 0);

    // Link to current quiz version
    // 5. Create new attempt
    const attempt = await this.db.createAttempt({
      quiz_id: quiz.id,
      quiz_version_id: versionSnapshot?.id,
      section_id: section?.id || null,
      student_id: student.id,
      attempt_number: finishedAttempts.length + 1,
      deadline_at: finalDeadline.toISOString(),
      max_score: maxScore,
      question_order: questionOrder,
    });

    await this.db.enrollStartedStudent(section, student);
    return this.getAttemptContext(attempt, false);
  }

  // Get sanitized attempt context for student taking quiz
  async getAttemptContext(attempt: QuizAttempt, isResumed: boolean) {
    const now = new Date();
    const deadline = new Date(attempt.deadline_at);
    let remainingSeconds = Math.max(
      0,
      Math.ceil((deadline.getTime() - now.getTime()) / 1000),
    );

    if (remainingSeconds <= 0 && attempt.status === "in_progress") {
      await this.finalizeAttempt(attempt.id, "timed_out");
      attempt.status = "timed_out";
      remainingSeconds = 0;
    }

    const allQuestions = await this.db.getAttemptQuestions(attempt);
    const questionsMap = new Map(allQuestions.map((q) => [q.id, q]));

    // Order questions according to attempt's frozen question_order
    const orderedQuestions: Question[] = [];
    for (const qId of attempt.question_order) {
      const q = questionsMap.get(qId);
      if (q) orderedQuestions.push(q);
    }

    const version = await this.db.getVersionForAttempt(attempt);

    // Sanitize questions: strip correct_answer, rubric, explanation
    const sanitizedQuestions: StudentQuestionView[] = orderedQuestions.map(
      (q, idx) => {
        let options = q.options
          ? q.options.map((opt) => ({ id: opt.id, text: opt.text }))
          : undefined;
        if (options && version.snapshot_data.randomize_options) {
          // Stable per attempt, including after refresh. No answer-key fields enter this ordering.
          options.sort(
            (a, b) =>
              this.orderKey(`${attempt.id}:${a.id}`) -
                this.orderKey(`${attempt.id}:${b.id}`) ||
              a.id.localeCompare(b.id),
          );
        }
        return {
          id: q.id,
          quiz_id: q.quiz_id,
          type: q.type,
          prompt: q.prompt,
          points: q.points,
          order_index: idx,
          options,
        };
      },
    );

    // Retrieve saved answers
    const answers = await this.db.getAnswersByAttempt(attempt.id);
    const savedAnswers: Record<string, any> = {};
    for (const ans of answers) {
      savedAnswers[ans.question_id] = ans.answer;
    }

    return {
      attempt: await this.studentView(attempt),
      section_name: attempt.section_id
        ? (await this.db.getSection(attempt.section_id))?.name
        : undefined,
      title: version.snapshot_data.title,
      instructions: version.snapshot_data.instructions,
      serverTime: new Date().toISOString(),
      questions: sanitizedQuestions,
      savedAnswers,
      remainingSeconds,
      isResumed,
    };
  }

  async getAttempt(attemptId: string, userId: string): Promise<QuizAttempt> {
    const attempt = await this.db.getAttemptById(attemptId);
    if (!attempt) throw new NotFoundException("Attempt not found");

    const quiz = await this.db.getQuizById(attempt.quiz_id);
    // Student can only access own attempt; teacher can access attempt on their quiz
    if (attempt.student_id !== userId && quiz?.teacher_id !== userId) {
      throw new ForbiddenException("Access denied to this attempt");
    }

    // Attach student profile & quiz
    const profile = await this.db.getProfile(attempt.student_id);
    if (profile) attempt.student_profile = profile;
    if (quiz)
      attempt.quiz = {
        ...quiz,
        questions: await this.db.getAttemptQuestions(attempt),
      };

    return attempt.student_id === userId ? this.studentView(attempt) : attempt;
  }

  // Submit attempt (idempotent)
  async submitAttempt(
    attemptId: string,
    studentId: string,
    isTimeout = false,
  ): Promise<QuizAttempt> {
    const attempt = await this.db.getAttemptById(attemptId);
    if (!attempt) throw new NotFoundException("Attempt not found");
    if (attempt.student_id !== studentId)
      throw new ForbiddenException("You do not own this attempt");

    // Idempotency: if already finalized, return existing attempt without recalculating
    if (attempt.status !== "in_progress") {
      return this.studentView(attempt);
    }

    const now = new Date();
    const deadline = new Date(attempt.deadline_at);
    const finalStatus = isTimeout || now > deadline ? "timed_out" : "submitted";

    return this.studentView(await this.finalizeAttempt(attemptId, finalStatus));
  }

  // Finalize attempt and run auto-grading
  async finalizeAttempt(
    attemptId: string,
    status: "submitted" | "timed_out" | "terminated_violation",
  ): Promise<QuizAttempt> {
    if (this.db.isLive)
      return this.db.command<QuizAttempt>("finalize", null, {
        attempt_id: attemptId,
        status,
      });
    return this.db.withLock(`attempt:${attemptId}`, () =>
      this.finalizeDemoAttempt(attemptId, status),
    );
  }

  // Caller must hold the per-attempt demo lock.
  async finalizeDemoAttempt(
    attemptId: string,
    status: "submitted" | "timed_out" | "terminated_violation",
  ): Promise<QuizAttempt> {
    const attempt = await this.db.getAttemptById(attemptId);
    if (!attempt) throw new NotFoundException("Attempt not found");
    if (attempt.status !== "in_progress") return attempt;
    if (Date.now() >= Date.parse(attempt.deadline_at)) status = "timed_out";
    const updated = await this.db.updateAttempt(attemptId, {
      status,
      submitted_at: new Date().toISOString(),
    });

    // Run automatic grading on objective questions
    return this.gradingService.autoGradeAttempt(updated);
  }

  // Teacher: force submit an attempt
  async forceSubmitByTeacher(
    attemptId: string,
    teacherId: string,
  ): Promise<QuizAttempt> {
    const attempt = await this.db.getAttemptById(attemptId);
    if (!attempt) throw new NotFoundException("Attempt not found");

    const quiz = await this.db.getQuizById(attempt.quiz_id);
    if (!quiz || quiz.teacher_id !== teacherId) {
      throw new ForbiddenException("You do not own this quiz");
    }

    if (attempt.status !== "in_progress") {
      return attempt;
    }

    return this.finalizeAttempt(attemptId, "submitted");
  }

  // Teacher: list all attempts for a quiz
  async listForQuiz(quizId: string, teacherId: string): Promise<QuizAttempt[]> {
    const quiz = await this.db.getQuizById(quizId);
    if (!quiz) throw new NotFoundException("Quiz not found");
    if (quiz.teacher_id !== teacherId)
      throw new ForbiddenException("You do not own this quiz");

    const attempts = await this.db.listAttemptsByQuiz(quizId);
    for (const attempt of attempts) {
      const studentProfile = await this.db.getProfile(attempt.student_id);
      if (studentProfile) attempt.student_profile = studentProfile;
      attempt.section_name = attempt.section_id
        ? (await this.db.getSection(attempt.section_id))?.name
        : undefined;
    }
    return attempts;
  }

  // Student: list their own past attempts
  async listForStudent(studentId: string): Promise<QuizAttempt[]> {
    const attempts = await this.db.listAttemptsByStudent(studentId);
    for (const attempt of attempts) {
      const quiz = await this.db.getQuizById(attempt.quiz_id);
      if (quiz) {
        attempt.section_name = attempt.section_id
          ? (await this.db.getSection(attempt.section_id))?.name
          : undefined;
        attempt.quiz = {
          id: quiz.id,
          title: quiz.title,
          subject: quiz.subject,
          exam_format: quiz.exam_format || "online",
          access_code: attempt.section_id
            ? (await this.db.getSection(attempt.section_id))?.access_code ||
              quiz.access_code
            : quiz.access_code,
          release_scores_immediately: quiz.release_scores_immediately,
          release_answers_immediately: quiz.release_answers_immediately,
        };
      }
    }
    return Promise.all(
      attempts.map(async (a) => ({
        ...(await this.studentView(a)),
        quiz: a.quiz,
      })),
    );
  }

  async getStudentPerformance(studentId: string) {
    return buildStudentPerformance(await this.listForStudent(studentId));
  }

  // Student reviews submitted result (gated by teacher release settings)
  async getStudentResult(attemptId: string, studentId: string) {
    const attempt = await this.db.getAttemptById(attemptId);
    if (!attempt) throw new NotFoundException("Attempt not found");
    if (attempt.student_id !== studentId)
      throw new ForbiddenException("Not your attempt");

    const quiz = await this.db.getQuizById(attempt.quiz_id);
    if (!quiz) throw new NotFoundException("Quiz not found");

    const answers = await this.db.getAnswersByAttempt(attemptId);
    const questions = await this.db.getAttemptQuestions(attempt);

    const isFinal = attempt.status !== "in_progress";
    const canViewScore = isFinal && quiz.release_scores_immediately;
    const canViewAnswers = isFinal && quiz.release_answers_immediately;

    const breakdown = questions.map((q) => {
      const ans = answers.find((a) => a.question_id === q.id);
      return {
        question_id: q.id,
        prompt: q.prompt,
        type: q.type,
        points: q.points,
        student_answer: this.displayAnswer(q, ans?.answer),
        score_awarded: canViewScore ? ans?.score_awarded : null,
        teacher_feedback: canViewScore ? ans?.teacher_feedback : null,
        correct_answer: canViewAnswers
          ? this.displayAnswer(q, q.correct_answer)
          : null,
        explanation: canViewAnswers ? q.explanation : null,
      };
    });

    const incidents = await this.db.getIncidentsByAttempt(attempt.id);
    const version = await this.db.getVersionForAttempt(attempt);
    return {
      receipt: {
        reference: attempt.id,
        finalized: isFinal,
        finalizedAt: attempt.submitted_at || null,
        deadlineAt: attempt.deadline_at,
        quizVersion: version.version_number,
        answeredCount: answers.filter(
          (a) =>
            a.answer !== null &&
            a.answer !== undefined &&
            String(a.answer).trim() !== "",
        ).length,
        totalQuestions: questions.length,
        lastSavedAt:
          answers
            .map((a) => a.updated_at)
            .sort()
            .at(-1) || null,
        incidents: incidents.map((i) => ({
          type: i.incident_type,
          occurredAt: i.occurred_at,
          warningNumber: i.warning_number,
        })),
      },
      attempt: {
        id: attempt.id,
        status: attempt.status,
        started_at: attempt.started_at,
        submitted_at: attempt.submitted_at,
        score: canViewScore ? attempt.score : null,
        max_score: attempt.max_score,
        is_graded: attempt.is_graded,
        warning_count: attempt.warning_count,
      },
      quiz: {
        id: quiz.id,
        access_code: attempt.section_id
          ? (await this.db.getSection(attempt.section_id))?.access_code ||
            quiz.access_code
          : quiz.access_code,
        title: version.snapshot_data.title,
        release_scores_immediately: quiz.release_scores_immediately,
        release_answers_immediately: quiz.release_answers_immediately,
      },
      breakdown,
    };
  }
}
