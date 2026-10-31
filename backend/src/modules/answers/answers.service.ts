import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { AttemptsService } from '../attempts/attempts.service';
import { AttemptAnswer } from '../../common/types';
import { SaveAnswerDto } from './answers.dto';

@Injectable()
export class AnswersService {
  constructor(
    private db: DatabaseService,
    private attemptsService: AttemptsService,
  ) {}

  async autosaveAnswer(
    attemptId: string,
    studentId: string,
    dto: SaveAnswerDto,
  ): Promise<{ status: string; answer: AttemptAnswer }> {
    if (this.db.isLive) return this.db.command('save', studentId, { attempt_id: attemptId, question_id: dto.question_id, answer: dto.answer });
    return this.db.withLock(`attempt:${attemptId}`, () => this.saveDemo(attemptId, studentId, dto));
  }

  private async saveDemo(attemptId: string, studentId: string, dto: SaveAnswerDto): Promise<{ status: string; answer: AttemptAnswer }> {
    const attempt = await this.db.getAttemptById(attemptId);
    if (!attempt) throw new NotFoundException('Attempt not found');
    if (attempt.student_id !== studentId) throw new ForbiddenException('You do not own this attempt');

    // Check if attempt is active
    if (attempt.status !== 'in_progress') {
      throw new BadRequestException(`Cannot save answer: attempt is ${attempt.status}`);
    }

    // Server-enforced deadline check
    const now = new Date();
    const deadline = new Date(attempt.deadline_at);
    if (now >= deadline) {
      // Auto-finalize as timed_out
      await this.attemptsService.finalizeDemoAttempt(attemptId, 'timed_out');
      // A closed response commits expiry; throwing here would roll back the MySQL transaction.
      if (this.db.isMysql) return { status: 'closed', answer: null };
      throw new BadRequestException('Deadline has expired for this attempt');
    }

    // Verify question belongs to this quiz
    const question = (await this.db.getAttemptQuestions(attempt)).find(q => q.id === dto.question_id);
    if (!question || question.quiz_id !== attempt.quiz_id) {
      throw new BadRequestException('Question does not belong to this quiz attempt');
    }

    if ((question.type === 'mcq' || question.type === 'true_false') && dto.answer !== null && dto.answer !== undefined && !question.options?.some(o => o.id === dto.answer)) {
      throw new BadRequestException('Choose one of the available answers');
    }
    const saved = await this.db.saveAnswer(attemptId, dto.question_id, dto.answer);

    return {
      status: 'saved',
      answer: saved,
    };
  }

  async getAnswersForAttempt(attemptId: string, userId: string): Promise<AttemptAnswer[]> {
    const attempt = await this.db.getAttemptById(attemptId);
    if (!attempt) throw new NotFoundException('Attempt not found');

    const quiz = await this.db.getQuizById(attempt.quiz_id);
    if (attempt.student_id !== userId && quiz?.teacher_id !== userId) {
      throw new ForbiddenException('Access denied');
    }

    const answers = await this.db.getAnswersByAttempt(attemptId);
    if (attempt.student_id === userId && (!quiz?.release_scores_immediately || attempt.status === 'in_progress')) {
      return answers.map(a => ({ ...a, score_awarded: undefined, teacher_feedback: undefined, is_manually_graded: false }));
    }
    return answers;
  }
}
