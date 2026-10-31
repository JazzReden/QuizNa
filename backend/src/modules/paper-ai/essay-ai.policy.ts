import { BadGatewayException, BadRequestException } from "@nestjs/common";
export interface Criterion {
  name: string;
  points: number;
  description: string;
}
export interface EssayContext {
  questionId: string;
  number: number;
  prompt: string;
  points: number;
  criteria: Criterion[];
  basis: "published" | "suggested";
  guide: string;
}
export const LEVEL_NAMES = [
  "Excellent",
  "Proficient",
  "Developing",
  "Beginning",
  "No evidence",
];
const RATIOS = [1, 0.75, 0.5, 0.25, 0];
const round = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;
export function criteriaForQuestion(question: {
  rubric?: string;
  points: number;
}): { criteria: Criterion[]; basis: "published" | "suggested" } {
  if (question.rubric?.startsWith("Essay criteria\n")) {
    const lines = question.rubric.trim().split("\n").slice(1),
      criteria = lines.map((line) => {
        const match =
          /^(.{1,80}) \((\d+(?:\.\d{1,2})?) points?\): (.{1,500})$/.exec(line);
        if (!match)
          throw new BadRequestException(
            "The published essay criteria need manual review",
          );
        return {
          name: match[1].trim(),
          points: Number(match[2]),
          description: match[3].trim(),
        };
      });
    if (
      criteria.some(
        (c) => !c.name || !c.description || !Number.isFinite(c.points),
      ) ||
      !criteria.length ||
      criteria.length > 8 ||
      new Set(criteria.map((c) => c.name.toLowerCase())).size !==
        criteria.length ||
      Math.round(criteria.reduce((sum, c) => sum + c.points, 0) * 100) !==
        Math.round(question.points * 100)
    )
      throw new BadRequestException(
        "The published essay criteria need manual review",
      );
    return { criteria, basis: "published" };
  }
  const total = Math.round(question.points * 100),
    part = Math.floor(total * 0.4);
  return {
    basis: "suggested",
    criteria: [
      {
        name: "Accuracy",
        points: part / 100,
        description: "Facts and explanations are correct.",
      },
      {
        name: "Completeness",
        points: part / 100,
        description: "Addresses every part with relevant details or examples.",
      },
      {
        name: "Clarity",
        points: (total - 2 * part) / 100,
        description: "Ideas are clear, organized and understandable.",
      },
    ],
  };
}
export function validateCrop(buffer: Buffer, mime: string) {
  if (
    mime !== "image/png" ||
    buffer.length < 24 ||
    buffer.length > 700000 ||
    !buffer
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    buffer.toString("ascii", 12, 16) !== "IHDR"
  )
    throw new BadRequestException("Upload a cropped PNG essay image");
  const width = buffer.readUInt32BE(16),
    height = buffer.readUInt32BE(20);
  if (
    width < 80 ||
    height < 40 ||
    width > 1600 ||
    height > 2400 ||
    width * height > 3200000
  )
    throw new BadRequestException("Essay image dimensions are unsupported");
}
export function validateSuggestion(raw: any, questions: EssayContext[]) {
  const invalid = () =>
    new BadGatewayException(
      "Essay reading returned an incomplete result. Retry or enter the response manually.",
    );
  if (
    !raw ||
    !Array.isArray(raw.essays) ||
    raw.essays.length !== questions.length
  )
    throw invalid();
  const seen = new Set<string>();
  const essays = raw.essays.map((item: any) => {
    const q = questions.find(
      (question) => question.questionId === item?.question_id,
    );
    if (
      !q ||
      seen.has(q.questionId) ||
      typeof item.transcription !== "string" ||
      item.transcription.length > 10000 ||
      typeof item.feedback !== "string" ||
      item.feedback.length > 1500 ||
      !["clear", "uncertain", "blank"].includes(item.legibility) ||
      !Array.isArray(item.criteria)
    )
      throw invalid();
    seen.add(q.questionId);
    const uncertain =
      item.legibility === "uncertain" ||
      /\[unclear\]/i.test(item.transcription);
    if (item.legibility === "clear" && !item.transcription.trim())
      throw invalid();
    if (item.legibility === "blank" && item.transcription.trim())
      throw invalid();
    if (uncertain)
      return {
        questionId: q.questionId,
        transcription: item.transcription,
        legibility: "uncertain",
        suggestedScore: null,
        maximum: q.points,
        criteria: [],
        feedback: "Handwriting needs review. No grade suggested.",
        basis: q.basis,
        needsReview: true,
      };
    if (item.criteria.length !== q.criteria.length) throw invalid();
    const indices = new Set<number>();
    const criteria = item.criteria
      .map((rating: any) => {
        if (
          !Number.isInteger(rating?.criterion_index) ||
          rating.criterion_index < 0 ||
          rating.criterion_index >= q.criteria.length ||
          indices.has(rating.criterion_index) ||
          !Number.isInteger(rating.level) ||
          rating.level < 0 ||
          rating.level > 4
        )
          throw invalid();
        indices.add(rating.criterion_index);
        if (item.legibility === "blank" && rating.level !== 4) throw invalid();
        const criterion = q.criteria[rating.criterion_index];
        return {
          index: rating.criterion_index,
          name: criterion.name,
          points: criterion.points,
          level: LEVEL_NAMES[rating.level],
          score: round(criterion.points * RATIOS[rating.level]),
        };
      })
      .sort((a, b) => a.index - b.index);
    const suggestedScore = round(criteria.reduce((sum, c) => sum + c.score, 0));
    if (suggestedScore > q.points) throw invalid();
    return {
      questionId: q.questionId,
      transcription: item.transcription,
      legibility: item.legibility,
      suggestedScore,
      maximum: q.points,
      criteria,
      feedback: item.feedback,
      basis: q.basis,
      needsReview: true,
    };
  });
  return { essays, requiresTeacherReview: true };
}
export function responseSchema(questionIds: string[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["essays"],
    properties: {
      essays: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "question_id",
            "transcription",
            "legibility",
            "criteria",
            "feedback",
          ],
          properties: {
            question_id: { type: "string", enum: questionIds },
            transcription: { type: "string" },
            legibility: {
              type: "string",
              enum: ["clear", "uncertain", "blank"],
            },
            feedback: { type: "string" },
            criteria: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["criterion_index", "level"],
                properties: {
                  criterion_index: { type: "integer" },
                  level: { type: "integer" },
                },
              },
            },
          },
        },
      },
    },
  };
}
