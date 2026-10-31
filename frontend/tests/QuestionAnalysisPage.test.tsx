import { afterEach, expect, it, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QuestionAnalysisPage } from "../src/pages/teacher/QuestionAnalysisPage";
const api = vi.hoisted(() => ({
  listTeacherQuizzes: vi.fn(),
  getQuestionAnalysis: vi.fn(),
}));
vi.mock("../src/api/client", () => ({ api }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const question = {
  id: "q1",
  order: 0,
  version: 1,
  type: "mcq",
  points: 2,
  prompt: "Which response shows resilience?",
  responses: 4,
  graded: 4,
  fullCredit: 1,
  pending: 0,
  unanswered: 1,
  averagePercent: 25,
  commonWrong: [{ answer: "Giving up", count: 2 }],
};
const analysis = {
  quiz: { id: "quiz", title: "Personal development" },
  submittedCount: 4,
  sections: [{ id: "section", name: "St. Vincent" }],
  rows: [
    question,
    {
      ...question,
      id: "essay",
      order: 1,
      type: "essay",
      graded: 0,
      fullCredit: 0,
      pending: 4,
      averagePercent: null,
      commonWrong: [],
    },
  ],
};
function show() {
  api.listTeacherQuizzes.mockResolvedValue([
    { id: "draft", title: "Draft", status: "draft" },
    { id: "quiz", title: "Personal development", status: "published" },
  ]);
  api.getQuestionAnalysis.mockResolvedValue(analysis);
  render(
    <MemoryRouter>
      <QuestionAnalysisPage />
    </MemoryRouter>,
  );
}
it("shows real analysis in a labelled table, including pending grades and wrong answers", async () => {
  show();
  const table = await screen.findByRole("table", {
    name: "Question analysis for Personal development",
  });
  expect(within(table).getByText("25%")).toBeTruthy();
  expect(within(table).getByText("1/4")).toBeTruthy();
  expect(within(table).getByText("Giving up")).toBeTruthy();
  expect(within(table).getByText("4 pending")).toBeTruthy();
  expect(within(table).getByText("Teacher-graded")).toBeTruthy();
  expect(screen.queryByRole("option", { name: "Draft" })).toBeNull();
  expect(within(table).queryByText("0%")).toBeNull();
});
it("requests analysis for the selected section", async () => {
  show();
  await screen.findByRole("table");
  fireEvent.change(screen.getByLabelText("Analysis section"), {
    target: { value: "section" },
  });
  await waitFor(() =>
    expect(api.getQuestionAnalysis).toHaveBeenLastCalledWith("quiz", "section"),
  );
});
it("shows a safe error and allows retrying", async () => {
  show();
  api.getQuestionAnalysis.mockRejectedValueOnce(
    new Error("private database detail"),
  );
  const error = await screen.findByRole("alert");
  expect(error.textContent).toContain("Unable to load analysis");
  expect(error.textContent).not.toContain("private database detail");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("table")).toBeTruthy();
});
