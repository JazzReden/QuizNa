import { validateEssayCriteria } from "./essay-criteria";
const guide =
  "Essay criteria\nAccuracy (2 points): Correct facts.\nCompleteness (2 points): Answers every part.\nClarity (1 points): Clear response.";
describe("Essay rubric validation", () => {
  it("accepts a balanced criterion budget and legacy text", () => {
    expect(() => validateEssayCriteria(guide, "essay", 5)).not.toThrow();
    expect(() =>
      validateEssayCriteria("Use sound reasoning", "essay", 5),
    ).not.toThrow();
  });
  it("rejects totals that differ from frozen question points and malformed criteria", () => {
    expect(() => validateEssayCriteria(guide, "essay", 6)).toThrow(
      "must equal",
    );
    expect(() =>
      validateEssayCriteria(
        guide + "\nAccuracy (0 points): Duplicate",
        "essay",
        5,
      ),
    ).toThrow("unique");
    expect(() =>
      validateEssayCriteria(
        "Essay criteria\nAccuracy (-1 points): No",
        "essay",
        5,
      ),
    ).toThrow();
    expect(() => validateEssayCriteria(guide, "mcq", 5)).toThrow(
      "only available",
    );
  });
});
