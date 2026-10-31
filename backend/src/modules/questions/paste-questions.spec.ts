import { parseMultipleChoice } from '../../../../frontend/src/utils/parseMultipleChoice';
import { readPoints } from '../../../../frontend/src/utils/points';

describe('Pasted multiple-choice formatter', () => {
  it('organizes inline and separate choices with mixed numbering and answer keys', () => {
    const result = parseMultipleChoice(
      '1. First question?\nA. One B. Two C. Three D. Four\nAnswer: B\n\nQuestion 2: Second question?\na)First\nb)Second\nc)Third\nd)Fourth\nAnswer key: 2. C',
    );
    expect(result.questions).toHaveLength(2);
    expect(result.questions[0].options.map((o) => o.text)).toEqual([
      'One',
      'Two',
      'Three',
      'Four',
    ]);
    expect(result.questions[0].correctAnswer).toBe('opt_2');
    expect(result.questions[1].correctAnswer).toBe('opt_3');
  });
  it('preserves wrapped prompts and choices and does not split decimal quantities', () => {
    const [q] = parseMultipleChoice(
      '1) Choose the distance\nfor this route.\nA) 1.5 kilometers\nover flat terrain\nB) 2 kilometers\nAnswer: A. 1.5 kilometers',
    ).questions;
    expect(q.prompt).toBe('Choose the distance\nfor this route.');
    expect(q.options[0].text).toContain('1.5 kilometers\nover flat terrain');
    expect(q.options).toHaveLength(2);
    expect(q.correctAnswer).toBe('opt_1');
  });
  it('leaves missing or unmatched answers for teacher selection', () => {
    expect(
      parseMultipleChoice('1. Pick one\nA. First\nB. Second').questions[0]
        .correctAnswer,
    ).toBe('');
    const [q] = parseMultipleChoice(
      '1. Pick one\nA. First\nB. Second\nAnswer: D',
    ).questions;
    expect(q.correctAnswer).toBe('');
    expect(q.notes.length).toBeGreaterThan(0);
  });
  it('recognizes marked answers and asks for review when labels or keys conflict', () => {
    expect(
      parseMultipleChoice('1. Pick one\nA. First\n*B. Second').questions[0]
        .correctAnswer,
    ).toBe('opt_2');
    const [q] = parseMultipleChoice(
      '1. Pick one\nA. First\nA. Second\nAnswer: A',
    ).questions;
    expect(q.correctAnswer).toBe('');
    expect(q.notes.join()).toContain('Repeated choice');
    const conflict = parseMultipleChoice(
      '1. Pick one\nA. First\nB. Second\nAnswer: A\nAnswer key: 1. B',
    ).questions[0];
    expect(conflict.correctAnswer).toBe('');
    expect(conflict.notes.join()).toContain('Conflicting');
  });
  it('handles unnumbered question blocks and textual correct answers', () => {
    const result = parseMultipleChoice(
      'Pick a planet?\nA) Earth\nB) Sun\nAnswer: Earth\n\nPick a star?\nA) Sun\nB) Moon',
    );
    expect(result.questions).toHaveLength(2);
    expect(result.questions[0].correctAnswer).toBe('opt_1');
  });
  it('handles a long quiz and bounds paste size and question count', () => {
    const source = Array.from(
      { length: 100 },
      (_, i) => `${i + 1}. Question ${i + 1}?\nA. Yes B. No\nAnswer: A`,
    ).join('\n');
    expect(parseMultipleChoice(source).questions).toHaveLength(100);
    expect(() =>
      parseMultipleChoice(source + '\n101. Extra\nA. Yes B. No'),
    ).toThrow('100 questions');
    expect(() => parseMultipleChoice('x'.repeat(100001))).toThrow('100,000');
  });
  it('renders arbitrary pasted markup as plain data and never evaluates it', () => {
    const [q] = parseMultipleChoice(
      '1. <script>alert(1)</script>\nA. <img src=x> B. Safe\nAnswer: B',
    ).questions;
    expect(q.prompt).toContain('<script>');
    expect(q.options[0].text).toBe('<img src=x>');
  });
});
describe('Typed points and grades', () => {
  it('distinguishes blank/invalid input from explicit zero', () => {
    for (const value of ['', ' ', '-', 'NaN', 'Infinity', '1e3', '1.234', '-1'])
      expect(readPoints(value)).toBeNull();
    expect(readPoints('0')).toBe(0);
    expect(readPoints('1.5')).toBe(1.5);
    expect(readPoints(' 2,25 ')).toBe(2.25);
  });
  it('enforces the available question points without silently rounding', () => {
    expect(readPoints('1.5', 1.5)).toBe(1.5);
    expect(readPoints('2', 1.5)).toBeNull();
    expect(readPoints('999999999')).toBeNull();
  });
});

describe('Mixed quiz paste regression', () => {
  const { mixedPaste } = require('../../../test/fixtures/mixed-paste');
  it('keeps every question after an inline answer key and reads the final key block', () => {
    const result = parseMultipleChoice(mixedPaste);
    expect(result.notices).toEqual([]);
    expect(result.questions).toHaveLength(8);
    expect(result.questions.map((q) => q.type)).toEqual([
      'mcq',
      'mcq',
      'mcq',
      'mcq',
      'mcq',
      'true_false',
      'true_false',
      'essay',
    ]);
    expect(result.questions.map((q) => q.correctAnswer)).toEqual([
      'opt_3',
      'opt_3',
      'opt_1',
      'opt_2',
      'opt_3',
      'opt_true',
      'opt_false',
      '',
    ]);
    expect(result.questions.every((q) => !q.notes.length)).toBe(true);
    expect(result.questions[7].points).toBe(3);
    expect(result.questions[7].prompt).toBe(
      'Explain how self-awareness and emotional regulation can help a Grade 12 student prepare for college or employment.',
    );
  });
  it('does not mistake a question beginning with A for an answer key entry', () => {
    const result = parseMultipleChoice(
      '1. First?\nA. One B. Two\nAnswer key: 1. A\n2. A student needs help. What should they do?\nA. Ask B. Ignore\nAnswer: A',
    );
    expect(result.questions).toHaveLength(2);
    expect(result.questions[1].prompt).toContain('A student');
  });
  it('continues parsing new questions after a standalone key section', () => {
    const result = parseMultipleChoice(
      '1. First?\nA. One B. Two\nAnswer key:\n1. A\n2. Second?\nA. One B. Two\nAnswer: B',
    );
    expect(result.questions).toHaveLength(2);
    expect(result.questions[1].correctAnswer).toBe('opt_2');
  });
  it('requires teacher selection when true/false keys conflict', () => {
    const [q] = parseMultipleChoice(
      '1. True or False: A claim.\nAnswer: True\nAnswer key: 1. False',
    ).questions;
    expect(q.type).toBe('true_false');
    expect(q.correctAnswer).toBe('');
    expect(q.notes.join()).toContain('Conflicting');
  });
});
