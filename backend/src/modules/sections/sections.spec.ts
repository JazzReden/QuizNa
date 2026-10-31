import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../database/database.service';
import { SectionsService } from './sections.service';
import { AttemptsService } from '../attempts/attempts.service';
import { GradingService } from '../grading/grading.service';
import { QuizzesService } from '../quizzes/quizzes.service';
import { buildLeaderboard } from '../reports/leaderboard';
import { QuizAttempt } from '../../common/types';
const teacher = 'a0000000-0000-0000-0000-000000000001',
  student = 'b0000000-0000-0000-0000-000000000002',
  quizId = 'c0000000-0000-0000-0000-000000000001';
describe('Quiz sections', () => {
  let db: DatabaseService, sections: SectionsService, attempts: AttemptsService;
  beforeEach(() => {
    db = new DatabaseService(new ConfigService({ NODE_ENV: 'test' }));
    sections = new SectionsService(db);
    attempts = new AttemptsService(db, new GradingService(db));
  });
  it('creates different codes and rejects duplicate names or another teacher', async () => {
    const a = await sections.create(quizId, teacher, ' STEM A '),
      b = await sections.create(quizId, teacher, 'STEM B');
    expect(a.name).toBe('STEM A');
    expect(a.access_code).not.toBe(b.access_code);
    expect(a.access_code).toMatch(/^S-[A-F0-9]{8}$/);
    await expect(sections.create(quizId, teacher, 'stem a')).rejects.toThrow(
      'already exists',
    );
    await expect(sections.list(quizId, 'other')).rejects.toThrow(
      'own this quiz',
    );
  });
  it('groups, resumes and prevents section switching or use of the general code', async () => {
    const a = await sections.create(quizId, teacher, 'A'),
      b = await sections.create(quizId, teacher, 'B'),
      profile = (await db.getProfile(student))!;
    const started = await attempts.startOrResumeAttempt(
      profile,
      a.access_code.toLowerCase(),
    );
    expect(started.attempt.section_id).toBe(a.id);
    expect(started.section_name).toBe('A');
    expect(
      (await attempts.startOrResumeAttempt(profile, a.access_code)).attempt.id,
    ).toBe(started.attempt.id);
    await expect(
      attempts.startOrResumeAttempt(profile, b.access_code),
    ).rejects.toThrow('original section');
    await expect(
      attempts.startOrResumeAttempt(profile, 'CS101'),
    ).rejects.toThrow('original section');
    expect((await attempts.listForStudent(student))[0].quiz.access_code).toBe(
      a.access_code,
    );
  });
  it('keeps old attempts unassigned and permits only owner corrections after submission', async () => {
    const a = await sections.create(quizId, teacher, 'A');
    const started = await attempts.startOrResumeAttempt(
      (await db.getProfile(student))!,
      'CS101',
    );
    await expect(
      sections.assign(started.attempt.id, teacher, a.id),
    ).rejects.toThrow('finishes');
    await attempts.submitAttempt(started.attempt.id, student);
    await expect(
      sections.assign(started.attempt.id, 'other', a.id),
    ).rejects.toThrow('own this quiz');
    const before = await db.getAttemptById(started.attempt.id);
    const after = await sections.assign(started.attempt.id, teacher, a.id);
    expect(after.section_id).toBe(a.id);
    expect(after.score).toBe(before.score);
    expect(after.warning_count).toBe(before.warning_count);
  });
  it('rejects a section from another quiz and reserves the section code namespace', async () => {
    const service = new QuizzesService(db);
    await expect(
      service.create((await db.getProfile(teacher))!, {
        title: 'Bad code',
        access_code: 'S-AAAAAAAA',
      }),
    ).rejects.toThrow('reserved');
    const other = await service.create((await db.getProfile(teacher))!, {
        title: 'Another',
      }),
      a = await sections.create(other.id, teacher, 'A');
    const started = await attempts.startOrResumeAttempt(
      (await db.getProfile(student))!,
      'CS101',
    );
    await attempts.submitAttempt(started.attempt.id, student);
    await expect(
      sections.assign(started.attempt.id, teacher, a.id),
    ).rejects.toThrow('from this quiz');
  });
});
describe('Teacher leaderboard', () => {
  const att = (
    id: string,
    student_id: string,
    score: number,
    is_graded = true,
    more: Partial<QuizAttempt> = {},
  ): QuizAttempt =>
    ({
      id,
      student_id,
      score,
      is_graded,
      max_score: 10,
      status: 'submitted',
      submitted_at: '2026-10-20T00:00:00Z',
      student_profile: { full_name: student_id } as any,
      ...more,
    }) as QuizAttempt;
  it('uses best graded attempt, shares ranks and excludes active/unfinished grades', () => {
    const rows = buildLeaderboard([
      att('a', 'Alice', 5),
      att('b', 'Alice', 9),
      att('c', 'Bob', 9),
      att('d', 'Cara', 7),
      att('e', 'Dina', 10, false),
      att('f', 'Eli', 10, true, { status: 'in_progress' }),
      att('g', 'Alice', 10, false),
    ]);
    expect(rows.map((r) => [r.studentName, r.rank, r.score])).toEqual([
      ['Alice', 1, 9],
      ['Bob', 1, 9],
      ['Cara', 3, 7],
      ['Dina', null, null],
    ]);
    expect(rows[0].attemptCount).toBe(3);
    expect(rows[0].reviewAttemptId).toBe('g');
  });
  it('normalizes different quiz editions by percentage and handles zero points', () => {
    const rows = buildLeaderboard([
      att('a', 'Alice', 8),
      att('b', 'Bob', 10, true, { max_score: 20 }),
      att('c', 'Cara', 0, true, { max_score: 0 }),
    ]);
    expect(rows.map((r) => r.percentage)).toEqual([80, 50, 0]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
  });
});
