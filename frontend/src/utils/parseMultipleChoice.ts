export interface PastedChoice {
  id: string;
  label: string;
  text: string;
}
export interface PastedQuestion {
  type?: 'mcq' | 'true_false' | 'essay';
  points?: number;
  sourceNumber: string;
  prompt: string;
  options: PastedChoice[];
  correctAnswer: string;
  notes: string[];
}
export interface PasteResult {
  questions: PastedQuestion[];
  notices: string[];
}

const questionStart =
  /^(?:(?:question|q)\s*)?(\d{1,3})\s*[).:\-](?!\d)\s*(.*)$/i;
const choiceStart = /^([*✓✔]?\s*)\(?([a-h])\s*[).:\-]\s*(.*)$/i;
const answerLine = /^(?:correct\s+answer|answer|ans|key)\s*[:=\-]\s*(.+)$/i;

/** Conservative local formatter. It never invents a question, option or answer key. */
export function parseMultipleChoice(source: string): PasteResult {
  if (source.length > 100000)
    throw new Error('Paste up to 100,000 characters at a time.');
  const notices: string[] = [];
  const questions: PastedQuestion[] = [];
  const keys = new Map<string, string>();
  const conflictingKeys = new Set<string>();
  const setKey = (number: string, value: string) => {
    if (
      keys.has(number) &&
      keys.get(number)!.toLowerCase() !== value.toLowerCase()
    )
      conflictingKeys.add(number);
    keys.set(number, value);
  };
  let current: PastedQuestion | undefined;
  let currentAnswer = '';
  let keySection = false;
  let blank = false;
  const finish = () => {
    if (!current) return;
    current.prompt = current.prompt.trim();
    current.type = 'mcq';
    if (
      !current.options.length &&
      /^true\s*(?:or|\/)\s*false\s*:/i.test(current.prompt)
    ) {
      current.type = 'true_false';
      current.prompt = current.prompt.replace(
        /^true\s*(?:or|\/)\s*false\s*:\s*/i,
        '',
      );
      current.options = [
        { id: 'opt_true', label: 'True', text: 'True' },
        { id: 'opt_false', label: 'False', text: 'False' },
      ];
    } else if (!current.options.length && /^essay\b/i.test(current.prompt)) {
      current.type = 'essay';
      const heading = current.prompt.match(
        /^essay\s*(?:[–—-]\s*)?(?:(\d+(?:[.,]\d{1,2})?)\s*(?:points?|pts?)\s*)?[:–—-]\s*/i,
      );
      if (heading) {
        current.prompt = current.prompt.slice(heading[0].length);
        if (heading[1]) current.points = Number(heading[1].replace(',', '.'));
      }
    }
    current.options.forEach((o) => (o.text = o.text.trim()));
    if (currentAnswer) setKey(current.sourceNumber, currentAnswer);
    questions.push(current);
    current = undefined;
    currentAnswer = '';
  };
  // Inline A–H choices and inline Answer: labels become ordinary lines.
  const text = source
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+(?=(?:Correct\s+answer|Answer|Ans)\s*[:=])/gi, '\n')
    .split('\n')
    .map((line) =>
      /^\s*(?:correct\s+answer|answer|ans|key)\s*(?:key)?\s*[:=\-]/i.test(line)
        ? line
        : line.replace(/[ \t]+(?=(?:[*✓✔]\s*)?\(?[A-Ha-h][).:]\s*)/g, '\n'),
    )
    .join('\n');
  // A key entry must consume the whole line: "4. A student..." is a question, not key A.
  const readKeys = (line: string): boolean => {
    const entries =
      /(?:^|[\s,;]+)(\d{1,3})\s*[).:\-=]?\s*(true|false|[a-h])[.)]?(?=$|[\s,;])/gi;
    const matches = [...line.matchAll(entries)];
    if (!matches.length || line.replace(entries, '').replace(/[\s,;]+/g, ''))
      return false;
    for (const entry of matches) setKey(entry[1], entry[2]);
    return true;
  };
  for (const original of text.split('\n')) {
    const line = original.trim();
    if (!line) {
      blank = true;
      continue;
    }
    const header = line.match(/^(?:answer\s*key|answers)\s*[:\-]?\s*(.*)$/i);
    if (header) {
      finish();
      keySection = true;
      if (header[1] && !readKeys(header[1]))
        notices.push(`Check this answer key: ${header[1].slice(0, 100)}`);
      continue;
    }
    if ((keySection || !current) && readKeys(line)) continue;
    // A numbered question resumes normal parsing after an inline or trailing key block.
    keySection = false;
    const numbered = line.match(questionStart);
    if (numbered) {
      finish();
      current = {
        sourceNumber: numbered[1],
        prompt: numbered[2],
        options: [],
        correctAnswer: '',
        notes: [],
      };
      blank = false;
      continue;
    }
    const answer = line.match(answerLine);
    if (answer && current) {
      currentAnswer = answer[1].trim();
      blank = false;
      continue;
    }
    const choice = line.match(choiceStart);
    if (choice) {
      if (!current) {
        current = {
          sourceNumber: String(questions.length + 1),
          prompt: '',
          options: [],
          correctAnswer: '',
          notes: [],
        };
      }
      const label = choice[2].toUpperCase();
      let content = choice[3].trim();
      const marked =
        Boolean(choice[1].trim()) ||
        /\s*(?:[✓✔]|\(correct\)|\[correct\])\s*$/i.test(content);
      content = content
        .replace(/\s*(?:[✓✔]|\(correct\)|\[correct\])\s*$/i, '')
        .trim();
      if (current.options.some((o) => o.label === label))
        current.notes.push(
          `Repeated choice ${label}; check the original text.`,
        );
      current.options.push({
        id: `opt_${current.options.length + 1}`,
        label,
        text: content,
      });
      if (marked) {
        if (current.correctAnswer)
          current.notes.push('More than one choice is marked correct.');
        current.correctAnswer = current.options[current.options.length - 1].id;
      }
      blank = false;
      continue;
    }
    if (
      /^(?:multiple[ -]choice(?:\s+questions)?|questions)\s*:?$/i.test(line) &&
      !current
    )
      continue;
    if (!current || (blank && current.options.length >= 2)) {
      finish();
      current = {
        sourceNumber: String(questions.length + 1),
        prompt: line,
        options: [],
        correctAnswer: '',
        notes: [],
      };
    } else if (current.options.length && !currentAnswer) {
      current.options[current.options.length - 1].text += '\n' + line;
    } else {
      current.prompt += (current.prompt ? '\n' : '') + line;
    }
    blank = false;
  }
  finish();
  if (questions.length > 100)
    throw new Error('Paste up to 100 questions at a time.');
  const usedNumbers = new Set<string>();
  for (const question of questions) {
    if (usedNumbers.has(question.sourceNumber))
      question.notes.push('Repeated question number; confirm the answer key.');
    usedNumbers.add(question.sourceNumber);
    if (conflictingKeys.has(question.sourceNumber))
      question.notes.push(
        'Conflicting answer keys; confirm the correct choice.',
      );
    const key = keys.get(question.sourceNumber);
    if (question.type === 'essay') {
      if (key) question.notes.push('Essay answers are graded by the teacher.');
      question.correctAnswer = '';
      continue;
    }
    if (question.type === 'true_false') {
      if (key && /^(true|false)$/i.test(key.trim()))
        question.correctAnswer =
          key.trim().toLowerCase() === 'true' ? 'opt_true' : 'opt_false';
      else if (key) question.notes.push('Choose True or False for the answer.');
      if (question.notes.length) question.correctAnswer = '';
      continue;
    }
    if (key) {
      const letter = key
        .match(/^\(?([a-h])\)?[).:]?(?:\s|$)/i)?.[1]
        ?.toUpperCase();
      const option = letter
        ? question.options.find((o) => o.label === letter)
        : question.options.find(
            (o) => o.text.toLowerCase() === key.toLowerCase(),
          );
      if (option) {
        if (question.correctAnswer && question.correctAnswer !== option.id)
          question.notes.push(
            'Conflicting answer marks; confirm the correct choice.',
          );
        question.correctAnswer = option.id;
      } else question.notes.push('The answer key does not match a choice.');
    }
    if (question.notes.length) question.correctAnswer = ''; // Ambiguous keys require an explicit teacher choice.
  }
  if (!questions.length)
    notices.push(
      'No questions found. Include the question text and lettered choices.',
    );
  return { questions, notices };
}
