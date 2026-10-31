import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  suggestedCriteria,
  parseCriteria,
  serializeCriteria,
  criteriaError,
  assessCriteria,
  splitCriteriaFeedback,
} from "../src/utils/essay-rubric";
import { EssayCriteriaGrader } from "../src/components/teacher/EssayCriteriaGrader";
import { EssayCriteriaEditor } from "../src/components/teacher/EssayCriteriaEditor";
describe("Essay criteria", () => {
  it("allocates fractional point budgets exactly and preserves legacy guides", () => {
    const rows = suggestedCriteria(1.25);
    expect(rows.reduce((n, row) => n + row.points, 0)).toBe(1.25);
    expect(parseCriteria("Grade for clear reasoning")).toBeNull();
    expect(parseCriteria(serializeCriteria(rows))).toEqual(rows);
  });
  it("rejects duplicate names, incomplete criteria and mismatched totals", () => {
    const rows = suggestedCriteria(5);
    expect(criteriaError(serializeCriteria(rows), 5)).toBeNull();
    expect(criteriaError(serializeCriteria(rows), 6)).toContain("total 6");
    expect(parseCriteria(serializeCriteria([rows[0], rows[0]]))).toBeNull();
    expect(parseCriteria("Essay criteria\nAccuracy (2 points): ")).toBeNull();
  });
  it("calculates five-level scores consistently with the shown percentages", () => {
    const rows = suggestedCriteria(5);
    expect(assessCriteria(rows, [0, 0, 0])?.total).toBe(5);
    expect(assessCriteria(rows, [1, 1, 1])?.total).toBe(3.75);
    expect(assessCriteria(rows, [-1, 0, 0])).toBeNull();
    expect(assessCriteria(rows, [0, 0])).toBeNull();
  });
  it("keeps only one criteria breakdown while preserving teacher notes", () => {
    const rows = suggestedCriteria(5),
      feedback =
        assessCriteria(rows, [0, 0, 0])!.feedback + "\n\nClear and complete.";
    const split = splitCriteriaFeedback(feedback, rows);
    expect(split.notes).toBe("Clear and complete.");
    expect(split.breakdown.split("\n")).toHaveLength(3);
  });
  it("requires a selection for each criterion before supplying a total", () => {
    const change = vi.fn();
    render(
      <EssayCriteriaGrader
        points={5}
        feedback=""
        disabled={false}
        onChange={change}
      />,
    );
    fireEvent.click(screen.getByText("Suggested criteria"));
    fireEvent.click(
      screen.getByRole("button", { name: "Accuracy: Excellent" }),
    );
    expect(change).toHaveBeenLastCalledWith(null, "");
    fireEvent.click(
      screen.getByRole("button", { name: "Completeness: Excellent" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Clarity: Excellent" }));
    expect(change).toHaveBeenLastCalledWith(
      "5",
      expect.stringContaining("Clarity: 1/1 (Excellent)"),
    );
  });
  it("restores saved performance levels and supports editing rubric weights", () => {
    const rows = suggestedCriteria(5),
      feedback = assessCriteria(rows, [1, 0, 0])!.feedback;
    const { unmount } = render(
      <EssayCriteriaGrader
        guide={serializeCriteria(rows)}
        points={5}
        feedback={feedback}
        disabled={false}
        onChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Grade by criteria · 4.5/5"));
    expect(
      screen
        .getByRole("button", { name: "Accuracy: Proficient" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    unmount();
    const change = vi.fn();
    render(<EssayCriteriaEditor points={5} value="" onChange={change} />);
    fireEvent.click(screen.getByRole("button", { name: "Use criteria" }));
    expect(change).toHaveBeenCalledWith(serializeCriteria(rows));
    fireEvent.change(screen.getByLabelText("Criterion 1 points"), {
      target: { value: "3" },
    });
    expect(change.mock.calls.at(-1)[0]).toContain("Accuracy (3 points)");
  });
});
