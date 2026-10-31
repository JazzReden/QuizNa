import { afterEach, expect, it, vi } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { GradebookPage } from "../src/pages/teacher/GradebookPage";
import { SectionResults } from "../src/components/teacher/SectionResults";
const api = vi.hoisted(() => ({
  listClasses: vi.fn(),
  getSectionGradebook: vi.fn(),
  getLeaderboard: vi.fn(),
}));
vi.mock("../src/api/client", () => ({ api }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("keeps the gradebook as a score grid, with confirmation links and clean totals", async () => {
  api.listClasses.mockResolvedValue([{ id: "class", name: "St. Vincent" }]);
  api.getSectionGradebook.mockResolvedValue({
    section: { id: "class", name: "St. Vincent" },
    quizzes: [{ id: "quiz", title: "Research" }],
    rows: [
      {
        name: "Zoe Adams",
        email: "zoe@test",
        onRoster: true,
        total: 0,
        outOf: 10,
        gradedCount: 1,
        cells: [
          {
            quizId: "quiz",
            score: 0,
            maxScore: 10,
            scoreAttemptId: "confirmed",
            pending: false,
            status: "submitted",
          },
        ],
      },
      {
        name: "Ben Cruz",
        email: "ben@test",
        onRoster: true,
        total: null,
        outOf: 0,
        gradedCount: 0,
        cells: [
          {
            quizId: "quiz",
            score: null,
            maxScore: null,
            pending: true,
            awaitingConfirmation: true,
            gradingAttemptId: "pending",
            status: "submitted",
          },
        ],
      },
    ],
  });
  render(
    <MemoryRouter>
      <GradebookPage />
    </MemoryRouter>,
  );
  const table = await screen.findByRole("table");
  expect(table.classList.contains("qn-gradebook-grid")).toBe(true);
  expect(table.classList.contains("qn-responsive-table")).toBe(false);
  expect(
    within(table)
      .getAllByRole("columnheader")
      .map((h) => h.textContent),
  ).toEqual(["Student", "Research", "Total"]);
  expect(within(table).queryByText("zoe@test")).toBeNull();
  expect(within(table).getAllByText("0/10")).toHaveLength(2);
  const confirm = screen.getByRole("link", {
    name: "Confirm Ben Cruz: Research, awaiting confirmation",
  });
  expect(confirm.getAttribute("href")).toContain("attempt=pending");
  expect(
    screen.getByRole("link", {
      name: "Review Zoe Adams: Research, score 0 out of 10",
    }),
  ).toBeTruthy();
});
it("shows ranking and scores without answer review or section reassignment", async () => {
  const row = {
    sectionId: "section",
    sectionName: "St. Vincent",
    studentId: "student",
    studentName: "Ben Cruz",
    studentLastName: "Cruz",
    studentEmail: "ben@test",
    rank: 1,
    score: 10,
    maxScore: 10,
    percentage: 100,
    isGraded: true,
    reviewAttemptId: "attempt",
    participation: "submitted",
    pendingAttempts: 0,
  };
  api.getLeaderboard.mockResolvedValue({
    quiz: { id: "quiz", title: "Research" },
    sections: [{ id: "section", name: "St. Vincent" }],
    rows: [
      row,
      {
        ...row,
        studentId: "pending",
        studentName: "Unconfirmed grading",
        score: null,
        isGraded: false,
      },
    ],
  });
  render(
    <MemoryRouter>
      <SectionResults
        quizzes={
          [{ id: "quiz", title: "Research", status: "published" }] as any
        }
        view="leaderboard"
      />
    </MemoryRouter>,
  );
  await screen.findByText("Ben Cruz");
  const table = screen.getByRole("table");
  expect(
    within(table)
      .getAllByRole("columnheader")
      .map((h) => h.textContent),
  ).toEqual(["Rank", "Student", "Section", "Score"]);
  expect(within(table).queryByRole("link")).toBeNull();
  expect(within(table).queryByRole("combobox")).toBeNull();
  expect(screen.queryByText("Unconfirmed grading")).toBeNull();
  expect(screen.queryByText("Review answers")).toBeNull();
  expect(screen.queryByText("Detailed CSV")).toBeNull();
});
