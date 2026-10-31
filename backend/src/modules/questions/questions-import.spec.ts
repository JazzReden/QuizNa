import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import { QuestionsService } from './questions.service';
import { ImportQuestionsDto } from './questions.dto';
const teacher = 'a0000000-0000-0000-0000-000000000001';
const quizId = 'c0000000-0000-0000-0000-000000000001';
const question = {
  prompt: 'Imported question?',
  points: 1.5,
  options: [
    { id: 'a', text: 'First' },
    { id: 'b', text: 'Second' },
  ],
  correct_answer: 'b',
};
describe('Question batch import', () => {
  let db: DatabaseService, service: QuestionsService;
  beforeEach(() => {
    db = new DatabaseService(new ConfigService({ NODE_ENV: 'test' }));
    service = new QuestionsService(db);
  });
  const payload = (): ImportQuestionsDto => ({
    quiz_id: quizId,
    import_id: randomUUID(),
    questions: [
      structuredClone(question),
      { ...structuredClone(question), prompt: 'Second question?' },
    ],
  });
  it('appends in order and repeated or concurrent requests create one batch', async () => {
    const dto = payload(),
      before = await db.listQuestions(quizId);
    const [first, second] = await Promise.all([
      service.importQuestions(teacher, dto),
      service.importQuestions(teacher, dto),
    ]);
    expect(first.map((q) => q.id)).toEqual(second.map((q) => q.id));
    expect(await db.listQuestions(quizId)).toHaveLength(before.length + 2);
    expect(first[1].order_index).toBe(first[0].order_index + 1);
    expect(first[0].points).toBe(1.5);
  });
  it('checks ownership before importing or replaying', async () => {
    await expect(
      service.importQuestions('other-teacher', payload()),
    ).rejects.toThrow('own this quiz');
  });
  it('rejects a bad answer key before saving any question', async () => {
    const before = await db.listQuestions(quizId),
      dto = payload();
    dto.questions[1].correct_answer = 'missing';
    await expect(service.importQuestions(teacher, dto)).rejects.toThrow(
      'correct answer',
    );
    expect(await db.listQuestions(quizId)).toHaveLength(before.length);
  });
  it('rejects reuse with changed content instead of overwriting questions', async () => {
    const dto = payload();
    await service.importQuestions(teacher, dto);
    dto.questions[0].prompt = 'Different';
    await expect(service.importQuestions(teacher, dto)).rejects.toThrow(
      'already saved',
    );
  });
  it('validates nested choices, decimals and batch limits at the HTTP boundary', async () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    const validate = (value: unknown) =>
      pipe.transform(value, { type: 'body', metatype: ImportQuestionsDto });
    await expect(validate(payload())).resolves.toBeInstanceOf(
      ImportQuestionsDto,
    );
    const invalid = payload();
    invalid.questions[0].points = -1;
    await expect(validate(invalid)).rejects.toThrow();
    invalid.questions[0].points = 1.234;
    await expect(validate(invalid)).rejects.toThrow();
    const empty = payload();
    empty.questions[0].options[0].text = '';
    await expect(validate(empty)).rejects.toThrow();
    const excessive = payload();
    excessive.questions = Array.from({ length: 101 }, () => question);
    await expect(validate(excessive)).rejects.toThrow();
  });
});

describe('Mixed-type import persistence', () => {
  it('keeps types, written-answer points, canonical true/false choices and replay identity', async () => {
    const { parseMultipleChoice } =
      await import('../../../../frontend/src/utils/parseMultipleChoice');
    const { mixedPaste } = await import('../../../test/fixtures/mixed-paste');
    const db = new DatabaseService(new ConfigService({ NODE_ENV: 'test' })),
      service = new QuestionsService(db);
    const dto: ImportQuestionsDto = {
      quiz_id: quizId,
      import_id: randomUUID(),
      questions: parseMultipleChoice(mixedPaste).questions.map((q) => ({
        type: q.type,
        prompt: q.prompt,
        points: q.points ?? 1,
        options: q.options.map(({ id, text }) => ({ id, text })),
        correct_answer: q.type === 'essay' ? null : q.correctAnswer,
      })),
    };
    const saved = await service.importQuestions(teacher, dto);
    expect(saved).toHaveLength(8);
    expect(saved[5].type).toBe('true_false');
    expect(saved[6].correct_answer).toBe('opt_false');
    expect(saved[7].type).toBe('essay');
    expect(saved[7].points).toBe(3);
    expect(saved[7].correct_answer).toBeNull();
    expect(
      (await service.importQuestions(teacher, dto)).map((q) => q.id),
    ).toEqual(saved.map((q) => q.id));
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    await expect(
      pipe.transform(dto, { type: 'body', metatype: ImportQuestionsDto }),
    ).resolves.toBeInstanceOf(ImportQuestionsDto);
  });
});
