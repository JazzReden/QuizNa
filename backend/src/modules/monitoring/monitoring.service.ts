import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { IncidentType, QuizAttempt, QuizIncident } from "../../common/types";
import { DatabaseService } from "../../database/database.service";
import { AttemptsService } from "../attempts/attempts.service";

@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);

  constructor(
    private db: DatabaseService,
    private attemptsService: AttemptsService,
  ) {}

  async reportIncident(
    attemptId: string,
    studentId: string,
    type: IncidentType,
    details?: Record<string, any>,
  ): Promise<{
    deduplicated: boolean;
    warning_number: number;
    action_taken: "none" | "first_warning" | "final_warning" | "terminated";
    incident?: QuizIncident;
    attempt?: QuizAttempt;
  }> {
    if (this.db.isLive)
      return this.db.command("incident", studentId, {
        attempt_id: attemptId,
        incident_type: type,
        details: details || {},
      });
    return this.db.withLock(`attempt:${attemptId}`, () =>
      this.reportDemoIncident(attemptId, studentId, type, details),
    );
  }

  private async reportDemoIncident(
    attemptId: string,
    studentId: string,
    type: IncidentType,
    details?: Record<string, any>,
  ) {
    const attempt = await this.db.getAttemptById(attemptId);
    if (!attempt) throw new NotFoundException("Attempt not found");
    if (attempt.student_id !== studentId)
      throw new ForbiddenException("You do not own this attempt");

    if (attempt.status !== "in_progress") {
      return {
        deduplicated: true,
        warning_number: attempt.warning_count,
        action_taken: "none" as const,
      };
    }

    const now = Date.now();
    if (now >= Date.parse(attempt.deadline_at)) {
      await this.attemptsService.finalizeDemoAttempt(attemptId, "timed_out");
      return {
        deduplicated: true,
        warning_number: attempt.warning_count,
        action_taken: "none" as const,
      };
    }

    // 1. Initial setup tolerance: ignore focus changes within first 3 seconds of attempt start
    const startTime = new Date(attempt.started_at).getTime();
    if (now - startTime < 3000) {
      this.logger.log(
        `Ignoring incident during initial setup window for attempt: ${attemptId}`,
      );
      return {
        deduplicated: true,
        warning_number: attempt.warning_count,
        action_taken: "none" as const,
      };
    }

    // 2. Deduplication check: if an incident was reported within the last 2000ms, deduplicate
    const incidents = await this.db.getIncidentsByAttempt(attemptId);
    const lastTime = incidents.length
      ? Date.parse(incidents[incidents.length - 1].occurred_at)
      : 0;
    if (now - lastTime < 2000) {
      this.logger.log(
        `Deduplicated cascading incident (${type}) for attempt: ${attemptId}`,
      );
      return {
        deduplicated: true,
        warning_number: attempt.warning_count,
        action_taken: "none" as const,
      };
    }

    // Increment warning count (max 3)
    const newWarningNumber = Math.min(3, (attempt.warning_count || 0) + 1);

    const incident = await this.db.logIncident(
      attemptId,
      type,
      newWarningNumber,
      details,
    );

    let actionTaken: "first_warning" | "final_warning" | "terminated" =
      "first_warning";
    if (newWarningNumber === 1) {
      actionTaken = "first_warning";
    } else if (newWarningNumber === 2) {
      actionTaken = "final_warning";
    } else if (newWarningNumber >= 3) {
      actionTaken = "terminated";
    }

    // Update warning count on attempt
    await this.db.updateAttempt(attemptId, {
      warning_count: newWarningNumber,
    });

    // 3. Third strike rule: stop further answering and finalize attempt
    if (newWarningNumber >= 3) {
      this.logger.warn(
        `Attempt ${attemptId} terminated due to 3rd violation strike`,
      );
      await this.attemptsService.finalizeDemoAttempt(
        attemptId,
        "terminated_violation",
      );
    }

    return {
      deduplicated: false,
      warning_number: newWarningNumber,
      action_taken: actionTaken,
      incident,
    };
  }

  async pardonStrike(
    attemptId: string,
    teacherId: string,
  ): Promise<QuizAttempt> {
    if (this.db.isLive)
      return this.db.command("pardon", teacherId, { attempt_id: attemptId });
    return this.db.withLock(`attempt:${attemptId}`, () =>
      this.pardonDemo(attemptId, teacherId),
    );
  }

  private async pardonDemo(
    attemptId: string,
    teacherId: string,
  ): Promise<QuizAttempt> {
    const attempt = await this.db.getAttemptById(attemptId);
    if (!attempt) throw new NotFoundException("Attempt not found");

    const quiz = await this.db.getQuizById(attempt.quiz_id);
    if (!quiz || quiz.teacher_id !== teacherId) {
      throw new ForbiddenException("You do not own this quiz");
    }

    const newWarningCount = Math.max(0, (attempt.warning_count || 0) - 1);
    const updates: Partial<QuizAttempt> = {
      warning_count: newWarningCount,
    };

    if (
      attempt.status !== "in_progress" ||
      Date.now() >= Date.parse(attempt.deadline_at)
    ) {
      throw new BadRequestException(
        "A finalized or expired attempt cannot be reopened",
      );
    }
    await this.db.logIncident(
      attemptId,
      "window_blur",
      Math.max(1, attempt.warning_count),
      { action: "teacher_pardon", teacher_id: teacherId },
    );
    return this.db.updateAttempt(attemptId, updates);
  }

  async getIncidentsForAttempt(
    attemptId: string,
    userId: string,
  ): Promise<QuizIncident[]> {
    const attempt = await this.db.getAttemptById(attemptId);
    if (!attempt) throw new NotFoundException("Attempt not found");

    const quiz = await this.db.getQuizById(attempt.quiz_id);
    if (attempt.student_id !== userId && quiz?.teacher_id !== userId) {
      throw new ForbiddenException("Access denied");
    }

    return this.db.getIncidentsByAttempt(attemptId);
  }

  async getLiveMonitorFeed(teacherId: string, quizId: string) {
    const quiz = await this.db.getQuizById(quizId);
    if (!quiz) throw new NotFoundException("Quiz not found");
    if (quiz.teacher_id !== teacherId)
      throw new ForbiddenException("You do not own this quiz");

    const attempts = await this.db.listAttemptsByQuiz(quizId);
    const enriched = [];

    for (const att of attempts) {
      const student = await this.db.getProfile(att.student_id);
      const incidents = await this.db.getIncidentsByAttempt(att.id);
      const answers = await this.db.getAnswersByAttempt(att.id);

      enriched.push({
        attempt: att,
        student,
        incidents,
        answeredCount: answers.length,
      });
    }

    return {
      quiz: {
        id: quiz.id,
        title: quiz.title,
        access_code: quiz.access_code,
        status: quiz.status,
      },
      students: enriched,
    };
  }
}
