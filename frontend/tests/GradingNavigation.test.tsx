import { expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { GradingPage } from "../src/pages/teacher/GradingPage";
const api = vi.hoisted(() => ({
  getTeacherQuiz: vi.fn(async () => ({
    id: "quiz",
    title: "Research methods",
  })),
  listQuizAttempts: vi.fn(async (): Promise<any[]> => []),
  getAttempt: vi.fn(),
  confirmScore: vi.fn(),
  getAttemptAnswers: vi.fn(),
}));
vi.mock("../src/api/client", () => ({ api }));
function show(query: string) {
  render(
    <MemoryRouter initialEntries={[`/teacher/grading/quiz${query}`]}>
      <Routes>
        <Route path="/teacher/grading/:quizId" element={<GradingPage />} />
      </Routes>
    </MemoryRouter>,
  );
}
it("shows a readable destination label and returns to the exact section quiz class list", async () => {
  show("?from=section-quiz&section=class-id&attempt=attempt-id");
  const back = await screen.findByRole("link", { name: "Back to class list" });
  expect(back.textContent).toBe("Back to class list");
  const url = new URL(back.getAttribute("href")!, "http://localhost");
  expect(url.pathname).toBe("/teacher/sections");
  expect(Object.fromEntries(url.searchParams)).toEqual({
    section: "class-id",
    tab: "codes",
    activity: "quiz",
    panel: "class-list",
  });
  expect(
    screen.getByRole("heading", { name: "Review student answers" }),
  ).toBeTruthy();
});
it("keeps the gradebook return destination and search", async () => {
  show("?from=gradebook&section=class-id&search=Ben");
  const back = await screen.findByRole("link", { name: "Back to gradebook" });
  expect(back.textContent).toBe("Back to gradebook");
  expect(back.getAttribute("href")).toBe(
    "/teacher/gradebook?section=class-id&search=Ben",
  );
});
it("uses a visible text label even when opened from the quiz library", async () => {
  show("");
  const back = await screen.findByRole("link", { name: "Back to quizzes" });
  expect(back.textContent).toBe("Back to quizzes");
  expect(back.getAttribute("href")).toBe("/teacher");
});

it("shows only the requested student's answers without student selectors or submission sidebar", async () => {
  const bea = {
    id: "bea-attempt",
    status: "submitted",
    section_name: "St. Filomena",
    student_profile: { full_name: "Bea Bautista" },
    score: 10,
    max_score: 10,
  };
  api.listQuizAttempts.mockResolvedValueOnce([
    bea,
    {
      ...bea,
      id: "adrian-attempt",
      student_profile: { full_name: "Adrian Aquino" },
    },
  ]);
  api.getAttempt.mockResolvedValueOnce({
    ...bea,
    quiz: {
      questions: [
        {
          id: "q1",
          type: "short_answer",
          points: 10,
          prompt: "Explain your answer.",
        },
      ],
    },
  });
  api.getAttemptAnswers.mockResolvedValueOnce([
    {
      id: "answer",
      question_id: "q1",
      answer: "Bea's own response",
      score_awarded: 10,
    },
  ]);
  show("?from=section-quiz&section=class-id&attempt=bea-attempt");
  expect(await screen.findByText("Bea's own response")).toBeTruthy();
  expect(
    screen.getByRole("heading", { name: "Reviewing: Bea Bautista" }),
  ).toBeTruthy();
  expect(screen.queryByText("Adrian Aquino")).toBeNull();
  expect(
    screen.queryByRole("region", { name: "Student submissions" }),
  ).toBeNull();
  expect(
    screen.queryByRole("heading", { name: /Student Submissions/i }),
  ).toBeNull();
  expect(screen.queryByLabelText("Grading section")).toBeNull();
  expect(screen.queryByRole("searchbox")).toBeNull();
  expect(api.getAttempt).toHaveBeenLastCalledWith("bea-attempt");
  expect(document.querySelector(".qn-single-review-layout")).toBeTruthy();
});
it("does not fall back to another student's answers when the requested attempt is missing", async () => {
  api.listQuizAttempts.mockResolvedValueOnce([
    {
      id: "other",
      status: "submitted",
      student_profile: { full_name: "Another student" },
    },
  ]);
  const before = api.getAttempt.mock.calls.length;
  show("?from=section-quiz&section=class-id&attempt=missing");
  expect(
    await screen.findByText("No answers available for this submission."),
  ).toBeTruthy();
  expect(screen.queryByText("Another student")).toBeNull();
  expect(api.getAttempt.mock.calls.length).toBe(before);
  expect(screen.getByRole("link", { name: "Back to class list" })).toBeTruthy();
});

it("requires a teacher click to confirm and sends the current revision", async () => {
  const attempt = {
    id: "confirm-attempt",
    status: "submitted",
    is_graded: true,
    score: 10,
    max_score: 10,
    updated_at: "2026-10-28T00:00:00.000Z",
    score_revision: 4,
    student_profile: { full_name: "Bea Bautista" },
    quiz: {
      questions: [
        { id: "q", type: "short_answer", points: 10, prompt: "Explain." },
      ],
    },
  };
  api.listQuizAttempts.mockResolvedValueOnce([attempt]);
  api.getAttempt.mockResolvedValueOnce(attempt);
  api.getAttemptAnswers.mockResolvedValueOnce([
    { id: "a", question_id: "q", answer: "My answer", score_awarded: 10 },
  ]);
  api.confirmScore.mockResolvedValueOnce({
    ...attempt,
    score_confirmed_at: "2026-10-28T00:01:00.000Z",
  });
  show("?attempt=confirm-attempt&from=section-quiz&section=class");
  const button = await screen.findByRole("button", { name: "Confirm score" });
  expect(button.hasAttribute("disabled")).toBe(false);
  const { fireEvent } = await import("@testing-library/react");
  fireEvent.click(button);
  await screen.findByRole("button", { name: "Confirmed" });
  expect(api.confirmScore).toHaveBeenLastCalledWith(
    "confirm-attempt",
    attempt.updated_at,
    4,
  );
});
it("blocks confirmation when displayed grades have unsaved changes", async () => {
  const attempt = {
    id: "dirty-attempt",
    status: "submitted",
    is_graded: true,
    score: 10,
    max_score: 10,
    updated_at: "2026-10-28T00:00:00.000Z",
    student_profile: { full_name: "Bea Bautista" },
    quiz: {
      questions: [
        { id: "q", type: "short_answer", points: 10, prompt: "Explain." },
      ],
    },
  };
  api.listQuizAttempts.mockResolvedValueOnce([attempt]);
  api.getAttempt.mockResolvedValueOnce(attempt);
  api.getAttemptAnswers.mockResolvedValueOnce([
    { id: "a", question_id: "q", answer: "Answer", score_awarded: 10 },
  ]);
  show("?attempt=dirty-attempt");
  await screen.findByRole("button", { name: "Confirm score" });
  const { fireEvent } = await import("@testing-library/react");
  fireEvent.change(screen.getByLabelText("Score for question 1"), {
    target: { value: "9" },
  });
  expect(
    screen
      .getByRole("button", { name: "Confirm score" })
      .hasAttribute("disabled"),
  ).toBe(true);
  expect(
    screen.getByText("Save your grade changes before confirming."),
  ).toBeTruthy();
});
