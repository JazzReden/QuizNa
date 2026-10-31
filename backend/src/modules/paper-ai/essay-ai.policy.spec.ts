import {
  criteriaForQuestion,
  validateCrop,
  validateSuggestion,
  EssayContext,
} from "./essay-ai.policy";
export function png() {
  const b = Buffer.alloc(25);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(b);
  b.write("IHDR", 12);
  b.writeUInt32BE(500, 16);
  b.writeUInt32BE(300, 20);
  return b;
}
export const context: EssayContext = {
  questionId: "essay",
  number: 56,
  prompt: "Explain self-awareness.",
  points: 5,
  guide: "",
  ...criteriaForQuestion({ points: 5 }),
};
export const raw = () => ({
  essays: [
    {
      question_id: "essay",
      transcription: "I reflect on my emotions.",
      legibility: "clear",
      feedback: "Clear but brief.",
      criteria: [
        { criterion_index: 0, level: 0 },
        { criterion_index: 1, level: 1 },
        { criterion_index: 2, level: 2 },
      ],
    },
  ],
});
describe("Essay draft validation", () => {
  it("computes totals from frozen weights, ignoring model-provided numeric scores", () => {
    const input: any = raw();
    input.essays[0].suggestedScore = 999;
    expect(validateSuggestion(input, [context]).essays[0].suggestedScore).toBe(
      4,
    );
  });
  it("parses published criteria and rejects mismatched point totals", () => {
    expect(
      criteriaForQuestion({
        points: 5,
        rubric: "Essay criteria\nContent (5 points): Correct examples.",
      }),
    ).toMatchObject({ basis: "published", criteria: [{ points: 5 }] });
    expect(() =>
      criteriaForQuestion({
        points: 6,
        rubric: "Essay criteria\nContent (5 points): Correct examples.",
      }),
    ).toThrow();
  });
  it.each(["uncertain", "clear"])(
    "never suggests a score for unreadable text (%s)",
    (legibility) => {
      const input = raw();
      input.essays[0].legibility = legibility;
      input.essays[0].transcription = "I [unclear].";
      expect(validateSuggestion(input, [context]).essays[0]).toMatchObject({
        suggestedScore: null,
        legibility: "uncertain",
        needsReview: true,
      });
    },
  );
  it("allows only a zero draft for blank answers", () => {
    const input = raw();
    input.essays[0].legibility = "blank";
    input.essays[0].transcription = "";
    expect(() => validateSuggestion(input, [context])).toThrow();
    input.essays[0].criteria.forEach((c) => (c.level = 4));
    expect(validateSuggestion(input, [context]).essays[0].suggestedScore).toBe(
      0,
    );
  });
  it.each(["duplicate", "missing", "wrong question", "invalid level"])(
    "rejects %s ratings",
    (kind) => {
      const input = raw();
      if (kind === "duplicate") input.essays[0].criteria[1].criterion_index = 0;
      if (kind === "missing") input.essays[0].criteria.pop();
      if (kind === "wrong question") input.essays[0].question_id = "other";
      if (kind === "invalid level") input.essays[0].criteria[0].level = 9;
      expect(() => validateSuggestion(input, [context])).toThrow();
    },
  );
  it("rejects oversized, mislabelled, malformed and extreme-dimension crops", () => {
    expect(() => validateCrop(png(), "image/png")).not.toThrow();
    expect(() => validateCrop(png(), "image/jpeg")).toThrow();
    expect(() => validateCrop(Buffer.alloc(700001), "image/png")).toThrow();
    const b = png();
    b.writeUInt32BE(99999, 16);
    expect(() => validateCrop(b, "image/png")).toThrow();
    expect(() => validateCrop(Buffer.alloc(25), "image/png")).toThrow();
  });
});
