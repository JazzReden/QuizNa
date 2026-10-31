export const questionTypeLabel = (type: string): string =>
  ({
    mcq: 'Multiple choice',
    true_false: 'True / false',
    short_answer: 'Short answer',
    essay: 'Essay',
  })[type] || 'Question';
