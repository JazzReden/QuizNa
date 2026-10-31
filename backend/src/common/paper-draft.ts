import { Question, Quiz, QuizVersion } from "./types";

// Compare printed/graded content, ignoring database timestamps and JSON key order.
export function hasPaperDraftChanges(
  quiz: Quiz,
  questions: Question[],
  edition: QuizVersion | null,
): boolean {
  if (quiz.exam_format !== "paper") return false;
  if (!edition) return questions.length > 0;
  const content = (
    value: Pick<
      Quiz,
      | "title"
      | "instructions"
      | "time_limit_minutes"
      | "randomize_questions"
      | "randomize_options"
    >,
    rows: Question[],
  ) => ({
    title: value.title,
    instructions: value.instructions || "",
    time: Number(value.time_limit_minutes),
    shuffleQuestions: !!value.randomize_questions,
    shuffleOptions: !!value.randomize_options,
    questions: rows
      .slice()
      .sort((a, b) => a.order_index - b.order_index || a.id.localeCompare(b.id))
      .map((q) => ({
        id: q.id,
        type: q.type,
        prompt: q.prompt,
        points: Number(q.points),
        options: (q.options || []).map((o) => ({ id: o.id, text: o.text })),
        answer: q.correct_answer ?? null,
        explanation: q.explanation || "",
        rubric: q.rubric || "",
      })),
  });
  return (
    JSON.stringify(content(quiz, questions)) !==
    JSON.stringify(
      content(edition.snapshot_data, edition.snapshot_data.questions),
    )
  );
}
