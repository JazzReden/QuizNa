import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { QuestionType, QuizAttempt } from "../../common/types";
import { DatabaseService } from "../../database/database.service";
import { GradeAnswerDto } from "./grading.dto";
import {
  EssayGradingStrategy,
  IGradingStrategy,
  McqGradingStrategy,
  ShortAnswerGradingStrategy,
  TrueFalseGradingStrategy,
} from "./grading.strategy";

@Injectable()
export class GradingService {
  private strategies: Map<QuestionType, IGradingStrategy> = new Map();

  constructor(private db: DatabaseService) {
    this.strategies.set("mcq", new McqGradingStrategy());
    this.strategies.set("true_false", new TrueFalseGradingStrategy());
    this.strategies.set("short_answer", new ShortAnswerGradingStrategy());
    this.strategies.set("essay", new EssayGradingStrategy());
  }

  getStrategy(type: QuestionType): IGradingStrategy {
    const strategy = this.strategies.get(type);
    if (!strategy) {
      throw new Error(`Grading strategy not found for question type: ${type}`);
    }
    return strategy;
  }

  async confirmScore(
    attemptId: string,
    teacherId: string,
    expectedUpdatedAt: string,
    expectedRevision: number,
  ): Promise<QuizAttempt> {
    if (this.db.isLive)
      return this.db.command("confirm_score", teacherId, {
        attempt_id: attemptId,
        expected_updated_at: expectedUpdatedAt,
        expected_revision: expectedRevision,
      });
    return this.db.withLock("local-business-operation", async () => {
      const attempt = await this.db.getAttemptById(attemptId);
      if (!attempt) throw new NotFoundException("Submission not found");
      const quiz = await this.db.getQuizById(attempt.quiz_id);
      if (!quiz || quiz.teacher_id !== teacherId)
        throw new ForbiddenException("You do not own this quiz");
      if (attempt.status === "in_progress" || !attempt.is_graded)
        throw new BadRequestException(
          "Finish grading all answers before confirming the score",
        );
      if (attempt.score_confirmed_at) return attempt;
      if (
        (attempt.score_revision || 0) !== expectedRevision ||
        Date.parse(attempt.updated_at) !== Date.parse(expectedUpdatedAt)
      )
        throw new ConflictException(
          "This result changed. Refresh and review it before confirming.",
        );
      return this.db.updateAttempt(attempt.id, {
        score_confirmed_at: new Date().toISOString(),
        score_confirmed_by: teacherId,
      });
    });
  }

  async autoGradeAttempt(attempt: QuizAttempt): Promise<QuizAttempt> {
    const questions = await this.db.getAttemptQuestions(attempt);
    const answers = await this.db.getAnswersByAttempt(attempt.id);
    const answersMap = new Map(answers.map((a) => [a.question_id, a]));

    let totalScore = 0;
    let allGraded = true;

    for (const question of questions) {
      const studentAns = answersMap.get(question.id);
      const strategy = this.getStrategy(question.type);
      const result = strategy.grade(question, studentAns?.answer);

      if (result.isAutoGraded) {
        totalScore += result.scoreAwarded;
        if (studentAns) {
          await this.db.updateAnswerGrade(studentAns.id, result.scoreAwarded);
        } else {
          // If student didn't answer, record zero
          const saved = await this.db.saveAnswer(attempt.id, question.id, null);
          await this.db.updateAnswerGrade(saved.id, 0);
        }
      } else {
        // Requires manual grading (e.g. essay)
        if (studentAns && studentAns.is_manually_graded) {
          totalScore += studentAns.score_awarded || 0;
        } else {
          if (!studentAns)
            await this.db.saveAnswer(attempt.id, question.id, null);
          allGraded = false;
        }
      }
    }

    const updated = await this.db.updateAttempt(attempt.id, {
      score: totalScore,
      is_graded: allGraded,
      score_confirmed_at: null,
      score_confirmed_by: null,
    });

    return updated;
  }

  async manualGradeAnswer(
    answerId: string,
    teacherId: string,
    dto: GradeAnswerDto,
    locked = false,
  ): Promise<any> {
    if (
      !this.db.isLive &&
      !locked &&
      (!this.db.isMysql || !this.db.hasLocalTransaction)
    )
      return this.db.withLock("local-business-operation", () =>
        this.manualGradeAnswer(answerId, teacherId, dto, true),
      );
    if (this.db.isLive)
      return this.db.command("grade", teacherId, {
        answer_id: answerId,
        score: dto.score_awarded,
        feedback: dto.teacher_feedback ?? "",
        require_ungraded: dto.require_ungraded ?? false,
        expected_answer: dto.expected_answer,
      });
    // Locate answer
    let targetAnswer: any = null;
    const allQuizzes = await this.db.listQuizzes(teacherId);

    // Find attempt
    for (const quiz of allQuizzes) {
      const attempts = await this.db.listAttemptsByQuiz(quiz.id);
      for (const att of attempts) {
        const answers = await this.db.getAnswersByAttempt(att.id);
        const match = answers.find((a) => a.id === answerId);
        if (match) {
          targetAnswer = { answer: match, attempt: att, quiz };
          break;
        }
      }
      if (targetAnswer) break;
    }

    if (!targetAnswer) {
      throw new NotFoundException(
        "Answer record not found or not owned by teacher",
      );
    }

    const frozenQuestions = await this.db.getAttemptQuestions(
      targetAnswer.attempt,
    );
    const question = frozenQuestions.find(
      (q) => q.id === targetAnswer.answer.question_id,
    );
    if (targetAnswer.attempt.status === "in_progress")
      throw new BadRequestException("Submit the attempt before grading");
    if (!question) throw new NotFoundException("Question not found");

    if (dto.score_awarded > question.points) {
      throw new BadRequestException(
        `Score awarded (${dto.score_awarded}) cannot exceed maximum points for question (${question.points})`,
      );
    }

    if (
      dto.require_ungraded &&
      (targetAnswer.answer.is_manually_graded ||
        String(targetAnswer.answer.answer ?? "").trim() !==
          dto.expected_answer?.trim())
    ) {
      if (
        targetAnswer.answer.is_manually_graded &&
        targetAnswer.answer.score_awarded === dto.score_awarded &&
        (targetAnswer.answer.teacher_feedback || "") ===
          (dto.teacher_feedback || "") &&
        String(targetAnswer.answer.answer ?? "").trim() ===
          dto.expected_answer?.trim()
      )
        return targetAnswer.answer;
      throw new ConflictException(
        "This answer changed. Review its current grade.",
      );
    }
    // Update answer score and feedback
    const updatedAnswer = await this.db.updateAnswerGrade(
      answerId,
      dto.score_awarded,
      dto.teacher_feedback,
    );

    // Recalculate total attempt score and check if now fully graded
    const answers = await this.db.getAnswersByAttempt(targetAnswer.attempt.id);
    const questions = await this.db.getAttemptQuestions(targetAnswer.attempt);
    let totalScore = 0;
    let allGraded = true;

    for (const q of questions) {
      const a = answers.find((ans) => ans.question_id === q.id);
      if (q.type === "essay") {
        if (a && a.is_manually_graded) {
          totalScore += a.score_awarded || 0;
        } else {
          allGraded = false;
        }
      } else {
        totalScore += a?.score_awarded || 0;
      }
    }

    await this.db.updateAttempt(targetAnswer.attempt.id, {
      score: totalScore,
      is_graded: allGraded,
      score_confirmed_at: null,
      score_confirmed_by: null,
    });

    return updatedAnswer;
  }
}
