import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { AttemptsService } from './attempts.service';
import { GradingService } from '../grading/grading.service';
import { DatabaseService } from '../../database/database.service';
import { UserProfile } from '../../common/types';
import { ConflictException } from '@nestjs/common';

describe('AttemptsService', () => {
  let service: AttemptsService;
  let db: DatabaseService;

  const mockStudent: UserProfile = {
    id: 'b0000000-0000-0000-0000-000000000002',
    email: 'student@quizna.dev',
    full_name: 'Alex Mercer',
    role: 'student',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [AttemptsService, GradingService, DatabaseService],
    }).compile();

    service = module.get<AttemptsService>(AttemptsService);
    db = module.get<DatabaseService>(DatabaseService);
  });

  it('should start a new attempt with access code CS101 and sanitize question answers', async () => {
    const res = await service.startOrResumeAttempt(mockStudent, 'CS101');

    expect(res.attempt).toBeDefined();
    expect(res.attempt.status).toBe('in_progress');
    expect(res.isResumed).toBe(false);
    expect(res.questions.length).toBeGreaterThan(0);
    expect(res.remainingSeconds).toBeGreaterThan(0);

    // Verify sanitization: questions do not leak correct_answer or rubric
    for (const q of res.questions) {
      expect((q as any).correct_answer).toBeUndefined();
      expect((q as any).rubric).toBeUndefined();
      expect((q as any).explanation).toBeUndefined();
    }
  });

  it('should restore existing attempt on reconnect/refresh while time remains', async () => {
    const firstCall = await service.startOrResumeAttempt(mockStudent, 'CS101');
    const secondCall = await service.startOrResumeAttempt(mockStudent, 'CS101');

    expect(secondCall.isResumed).toBe(true);
    expect(secondCall.attempt.id).toBe(firstCall.attempt.id);
  });

  it('should enforce attempt limits after submission', async () => {
    const startRes = await service.startOrResumeAttempt(mockStudent, 'CS101');
    await service.submitAttempt(startRes.attempt.id, mockStudent.id);

    // Quiz CS101 has max_attempts: 1. Attempting to start again should fail.
    await expect(service.startOrResumeAttempt(mockStudent, 'CS101')).rejects.toThrow(
      ConflictException,
    );
  });

  it('should handle idempotent submissions safely without duplicate scores', async () => {
    // Create attempt
    const newStudent: UserProfile = {
      id: 'student-id-99',
      email: 'newstudent@test.com',
      full_name: 'New Student',
      role: 'student',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await db.createProfile(newStudent);

    const startRes = await service.startOrResumeAttempt(newStudent, 'CS101');

    // Answer Q1 correctly
    await db.saveAnswer(startRes.attempt.id, 'd0000000-0000-0000-0000-000000000001', 'opt_2');

    // First submission
    const sub1 = await service.submitAttempt(startRes.attempt.id, newStudent.id);
    expect(sub1.status).toBe('submitted');
    expect(sub1.score).toBeUndefined(); // Scores stay private until teacher release
    expect((await db.getAttemptById(sub1.id))?.score).toBe(2.0);

    // Second simultaneous or repeated submission
    const sub2 = await service.submitAttempt(startRes.attempt.id, newStudent.id);
    expect(sub2.status).toBe('submitted');
    expect(sub2.score).toBeUndefined();
    expect(sub2.id).toBe(sub1.id);
  });
});
