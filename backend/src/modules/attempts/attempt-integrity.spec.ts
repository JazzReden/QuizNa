import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../database/database.service';
import { AttemptsService } from './attempts.service';
import { GradingService } from '../grading/grading.service';
import { AnswersService } from '../answers/answers.service';
import { MonitoringService } from '../monitoring/monitoring.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { AuthService } from '../auth/auth.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Reflector } from '@nestjs/core';
import { SaveAnswerDto } from '../answers/answers.dto';
import { ValidationPipe } from '@nestjs/common';

const quizId = 'c0000000-0000-0000-0000-000000000001';
const q1 = 'd0000000-0000-0000-0000-000000000001';
const studentId = 'b0000000-0000-0000-0000-000000000002';

describe('Attempt integrity regressions', () => {
  let db: DatabaseService;
  let attempts: AttemptsService;
  let answers: AnswersService;
  let monitoring: MonitoringService;
  beforeEach(() => {
    db = new DatabaseService(new ConfigService({ NODE_ENV: 'test' }));
    attempts = new AttemptsService(db, new GradingService(db));
    answers = new AnswersService(db, attempts);
    monitoring = new MonitoringService(db, attempts);
  });
  afterEach(() => jest.useRealTimers());
  const start = async () => attempts.startOrResumeAttempt((await db.getProfile(studentId))!, 'CS101');

  it('serializes concurrent starts to one active attempt', async () => {
    const results = await Promise.all(Array.from({ length: 12 }, start));
    expect(new Set(results.map(r => r.attempt.id)).size).toBe(1);
    expect(await db.listAttemptsByStudent(studentId)).toHaveLength(1);
  });
  it('rejects unknown access codes and teachers starting student attempts', async () => {
    const student = (await db.getProfile(studentId))!;
    await expect(attempts.startOrResumeAttempt(student, 'bad')).rejects.toThrow('not found');
    await expect(attempts.startOrResumeAttempt({ ...student, role: 'teacher' }, 'CS101')).rejects.toThrow('Student account');
  });
  it('serves and grades frozen questions after editing or deleting the draft', async () => {
    const first = await start();
    const original = first.questions[0];
    await db.updateQuestion(q1, { prompt: 'Changed prompt', correct_answer: 'opt_1', points: 99 });
    await answers.autosaveAnswer(first.attempt.id, studentId, { question_id: q1, answer: 'opt_2' });
    await db.deleteQuestion(q1);
    const resumed = await start();
    expect(resumed.questions[0]).toEqual(original);
    expect(resumed.savedAnswers[q1]).toBe('opt_2');
    await attempts.submitAttempt(first.attempt.id, studentId);
    expect((await db.getAttemptById(first.attempt.id))!.score).toBe(2);
    const result = await attempts.getStudentResult(first.attempt.id, studentId);
    expect(result.breakdown[0].prompt).toBe(original.prompt);
    expect(result.receipt.answeredCount).toBe(1);
  });
  it('keeps option order and deadline stable after refresh', async () => {
    const version = (await db.getQuizVersion(quizId, 1))!;
    await db.createQuizVersion(quizId, 2, { ...version.snapshot_data, randomize_options: true });
    await db.updateQuiz(quizId, { version: 2 });
    const first = await start();
    const second = await start();
    expect(second.questions).toEqual(first.questions);
    expect(second.attempt.deadline_at).toBe(first.attempt.deadline_at);
  });
  it('finalizes an expired attempt with the browser closed and consumes the attempt limit', async () => {
    const first = await start();
    await db.updateAttempt(first.attempt.id, { deadline_at: new Date(Date.now() - 1).toISOString() });
    await attempts.expireDueAttempts();
    expect((await db.getAttemptById(first.attempt.id))!.status).toBe('timed_out');
    await expect(start()).rejects.toThrow('maximum allowed');
  });
  it('does not reset attempt limits when an expired attempt is resumed', async () => {
    const first = await start();
    await db.updateAttempt(first.attempt.id, { deadline_at: new Date(Date.now() - 1).toISOString() });
    await expect(start()).rejects.toThrow('maximum allowed');
    expect(await db.listAttemptsByStudent(studentId)).toHaveLength(1);
  });
  it('rejects saves at the exact deadline, preserving earlier saved answers', async () => {
    const first = await start();
    await answers.autosaveAnswer(first.attempt.id, studentId, { question_id: q1, answer: 'opt_2' });
    jest.useFakeTimers().setSystemTime(new Date(first.attempt.deadline_at));
    await expect(answers.autosaveAnswer(first.attempt.id, studentId, { question_id: q1, answer: 'opt_1' })).rejects.toThrow('expired');
    expect((await db.getAnswersByAttempt(first.attempt.id)).find(a => a.question_id === q1)!.answer).toBe('opt_2');
  });
  it('concurrent and repeated submissions return one stable result', async () => {
    const first = await start();
    await answers.autosaveAnswer(first.attempt.id, studentId, { question_id: q1, answer: 'opt_2' });
    const results = await Promise.all(Array.from({ length: 10 }, () => attempts.submitAttempt(first.attempt.id, studentId)));
    expect(new Set(results.map(a => a.submitted_at)).size).toBe(1);
    expect((await db.getAttemptById(first.attempt.id))!.score).toBe(2);
    const saved = await db.getAnswersByAttempt(first.attempt.id);
    expect(new Set(saved.map(a => a.question_id)).size).toBe(saved.length);
  });
  it('does not leak unreleased scores through any student endpoint', async () => {
    const first = await start();
    await answers.autosaveAnswer(first.attempt.id, studentId, { question_id: q1, answer: 'opt_2' });
    const submitted = await attempts.submitAttempt(first.attempt.id, studentId);
    await db.updateAttempt(first.attempt.id, { is_graded: true });
    expect(submitted.score).toBeUndefined();
    expect((await attempts.getAttempt(first.attempt.id, studentId)).score).toBeUndefined();
    expect((await attempts.listForStudent(studentId))[0].score).toBeUndefined();
    expect((await answers.getAnswersForAttempt(first.attempt.id, studentId))[0].score_awarded).toBeUndefined();
    expect((await attempts.getStudentResult(first.attempt.id, studentId)).attempt.score).toBeNull();
    await db.updateQuiz(quizId, { release_scores_immediately: true });
    expect((await attempts.getStudentResult(first.attempt.id, studentId)).attempt.score).toBe(2);
  });
  it('never releases answer keys while the attempt is active', async () => {
    const first = await start();
    await db.updateQuiz(quizId, { release_answers_immediately: true, release_scores_immediately: true });
    const result = await attempts.getStudentResult(first.attempt.id, studentId);
    expect(result.breakdown.every(q => q.correct_answer === null)).toBe(true);
    expect(result.attempt.score).toBeNull();
  });
  it('enforces ownership for saves, submissions, results and monitoring', async () => {
    const first = await start();
    await expect(answers.autosaveAnswer(first.attempt.id, 'other', { question_id: q1, answer: 'opt_1' })).rejects.toThrow('own');
    await expect(attempts.submitAttempt(first.attempt.id, 'other')).rejects.toThrow('own');
    await expect(attempts.getStudentResult(first.attempt.id, 'other')).rejects.toThrow('Not your');
    await expect(monitoring.reportIncident(first.attempt.id, 'other', 'tab_hidden')).rejects.toThrow('own');
  });
  it('deduplicates simultaneous related events and survives service restart', async () => {
    const first = await start();
    await db.updateAttempt(first.attempt.id, { started_at: new Date(Date.now() - 10000).toISOString() });
    await Promise.all(['tab_hidden', 'window_blur', 'fullscreen_exit'].map(type => monitoring.reportIncident(first.attempt.id, studentId, type as any)));
    const restarted = new MonitoringService(db, attempts);
    expect((await restarted.reportIncident(first.attempt.id, studentId, 'tab_hidden')).deduplicated).toBe(true);
    expect((await db.getAttemptById(first.attempt.id))!.warning_count).toBe(1);
  });
  it('third incident finalizes saved answers and blocks edits', async () => {
    const first = await start();
    await answers.autosaveAnswer(first.attempt.id, studentId, { question_id: q1, answer: 'opt_2' });
    await db.updateAttempt(first.attempt.id, { started_at: new Date(Date.now() - 10000).toISOString(), warning_count: 2 });
    await monitoring.reportIncident(first.attempt.id, studentId, 'tab_hidden');
    expect((await db.getAttemptById(first.attempt.id))!.score).toBe(2);
    await expect(answers.autosaveAnswer(first.attempt.id, studentId, { question_id: q1, answer: 'opt_1' })).rejects.toThrow('terminated');
    await expect(monitoring.pardonStrike(first.attempt.id, 'a0000000-0000-0000-0000-000000000001')).rejects.toThrow('cannot be reopened');
  });
  it('keeps answer data through the global DTO whitelist', async () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    const dto = await pipe.transform({ question_id: q1, answer: 'opt_2' }, { type: 'body', metatype: SaveAnswerDto });
    expect(dto.answer).toBe('opt_2');
  });
  it('does not accept arbitrary user IDs, x-user-id or unknown demo logins', async () => {
    const guard = new AuthGuard(db);
    for (const headers of [{ 'x-user-id': studentId }, { authorization: `Bearer ${studentId}` }]) {
      await expect(guard.canActivate({ switchToHttp: () => ({ getRequest: () => ({ headers }) }) } as any)).rejects.toThrow();
    }
    await expect(new AuthService(db).login({ email: 'attacker-teacher@example.com' })).rejects.toThrow();
  });
  it('denies student access to teacher routes', () => {
    const reflector = { getAllAndOverride: () => ['teacher'] } as unknown as Reflector;
    const context = { getHandler: () => ({}), getClass: () => ({}), switchToHttp: () => ({ getRequest: () => ({ user: { role: 'student' } }) }) } as any;
    expect(() => new RolesGuard(reflector).canActivate(context)).toThrow();
  });
  it('fails closed for production demo configuration and missing live credentials', () => {
    expect(() => new DatabaseService(new ConfigService({ DEMO_MODE: 'true', NODE_ENV: 'production' }))).toThrow('disabled');
    expect(() => new DatabaseService(new ConfigService({ NODE_ENV: 'production', SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' }))).toThrow('Configure');
  });
});
