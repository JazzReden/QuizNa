export interface EssaySuggestion {
  questionId: string;
  transcription: string;
  legibility: "clear" | "uncertain" | "blank";
  suggestedScore: number | null;
  maximum: number;
  basis: "published" | "suggested";
  feedback: string;
  criteria: {
    index: number;
    name: string;
    points: number;
    level: string;
    score: number;
  }[];
}
export interface EssayDraft extends EssaySuggestion {
  preview: string;
  score: string;
  accepted: boolean;
  edited: boolean;
}
export interface ReviewedEssay {
  questionId: string;
  transcription: string;
  score: number;
  feedback: string;
}
export function editTranscription(
  draft: EssayDraft,
  transcription: string,
): EssayDraft {
  return { ...draft, transcription, accepted: false, score: "", edited: true };
}
export function reviewedEssays(
  drafts: Record<string, EssayDraft>,
  values: Record<string, string>,
): ReviewedEssay[] {
  return Object.values(drafts)
    .filter((d) => d.accepted)
    .map((d) => {
      const score = Number(d.score);
      if (
        d.transcription.trim() !== (values[d.questionId] || "").trim() ||
        !d.score.trim() ||
        !Number.isFinite(score) ||
        score < 0 ||
        score > d.maximum
      )
        throw Error("Check the selected essay scores before saving.");
      const breakdown =
        !d.edited && score === d.suggestedScore
          ? d.criteria
              .map((c) => `${c.name}: ${c.score}/${c.points} (${c.level})`)
              .join("\n")
          : "";
      return {
        questionId: d.questionId,
        transcription: d.transcription.trim(),
        score,
        feedback: [breakdown, d.feedback.trim()].filter(Boolean).join("\n"),
      };
    });
}
interface GradeApi {
  getAttemptAnswers(id: string): Promise<any[]>;
  gradeAnswer(
    id: string,
    score: number,
    feedback: string,
    expectedAnswer?: string,
  ): Promise<unknown>;
}
// Retrying after a lost response never overwrites a different, already-confirmed grade.
export async function applyReviewedEssays(
  api: GradeApi,
  attemptId: string,
  plans: ReviewedEssay[],
): Promise<ReviewedEssay[]> {
  const answers = await api.getAttemptAnswers(attemptId),
    pending: ReviewedEssay[] = [];
  for (const plan of plans) {
    const answer = answers.find((a) => a.question_id === plan.questionId);
    if (!answer || String(answer.answer ?? "").trim() !== plan.transcription) {
      pending.push(plan);
      continue;
    }
    if (answer.is_manually_graded) {
      if (
        Number(answer.score_awarded) !== plan.score ||
        (answer.teacher_feedback || "") !== plan.feedback
      )
        pending.push(plan);
      continue;
    }
    try {
      await api.gradeAnswer(
        answer.id,
        plan.score,
        plan.feedback,
        plan.transcription,
      );
    } catch {
      pending.push(plan);
    }
  }
  return pending;
}
