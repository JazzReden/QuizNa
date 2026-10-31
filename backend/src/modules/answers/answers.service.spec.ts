import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { AnswersService } from './answers.service';
import { AttemptsService } from '../attempts/attempts.service';
import { GradingService } from '../grading/grading.service';
import { DatabaseService } from '../../database/database.service';
import { BadRequestException } from '@nestjs/common';

describe('AnswersService', () => {
  let answersService: AnswersService;
  let attemptsService: AttemptsService;
  let db: DatabaseService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [AnswersService, AttemptsService, GradingService, DatabaseService],
    }).compile();

    answersService = module.get<AnswersService>(AnswersService);
    attemptsService = module.get<AttemptsService>(AttemptsService);
    db = module.get<DatabaseService>(DatabaseService);
  });

  it('should successfully autosave student answer during active attempt', async () => {
    const student = await db.getProfile('b0000000-0000-0000-0000-000000000002');
    const startRes = await attemptsService.startOrResumeAttempt(student!, 'CS101');

    const saveRes = await answersService.autosaveAnswer(
      startRes.attempt.id,
      student!.id,
      {
        question_id: 'd0000000-0000-0000-0000-000000000001',
        answer: 'opt_2',
      },
    );

    expect(saveRes.status).toBe('saved');
    expect(saveRes.answer.answer).toBe('opt_2');
  });

  it('should reject autosave and finalize attempt when deadline has expired', async () => {
    // Create attempt with expired deadline
    const attempt = await db.createAttempt({
      quiz_id: 'c0000000-0000-0000-0000-000000000001',
      student_id: 'b0000000-0000-0000-0000-000000000003',
      deadline_at: new Date(Date.now() - 5000).toISOString(), // 5s in past
      max_score: 10,
      question_order: [],
    });

    await expect(
      answersService.autosaveAnswer(attempt.id, attempt.student_id, {
        question_id: 'd0000000-0000-0000-0000-000000000001',
        answer: 'opt_1',
      }),
    ).rejects.toThrow(BadRequestException);

    const updated = await db.getAttemptById(attempt.id);
    expect(updated?.status).toBe('timed_out');
  });
});
