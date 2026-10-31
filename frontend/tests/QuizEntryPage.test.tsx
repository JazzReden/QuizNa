import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QuizEntryPage } from "../src/pages/student/QuizEntryPage";
const api = vi.hoisted(() => ({
  getSubject: vi.fn(),
  enterSubjectQuiz: vi.fn(),
  startOrResumeAttempt: vi.fn(),
}));
vi.mock("../src/api/client", () => ({ api }));
const room = {
  section_name: "Vincent",
  quizzes: [
    {
      id: "quiz",
      title: "Research quiz",
      require_access_code: true,
      exam_format: "online",
    },
  ],
};
beforeEach(() => {
  api.getSubject.mockResolvedValue(room);
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const show = () =>
  render(
    <MemoryRouter initialEntries={["/student/subjects/subject/quiz/quiz"]}>
      <Routes>
        <Route
          path="/student/subjects/:subjectId/quiz/:quizId"
          element={<QuizEntryPage />}
        />
        <Route path="/take/:accessCode" element={<h1>Quiz instructions</h1>} />
      </Routes>
    </MemoryRouter>,
  );
it("shows a clear code prompt and does not start a timer or attempt", async () => {
  show();
  expect(await screen.findByLabelText("Quiz code")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Research quiz" })).toBeTruthy();
  expect(api.startOrResumeAttempt).not.toHaveBeenCalled();
  expect(api.enterSubjectQuiz).not.toHaveBeenCalled();
});
it("verifies the code on the server before opening instructions", async () => {
  api.enterSubjectQuiz.mockResolvedValue({ access_code: "S-12345678" });
  show();
  fireEvent.change(await screen.findByLabelText("Quiz code"), {
    target: { value: "s-12345678" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(
    await screen.findByRole("heading", { name: "Quiz instructions" }),
  ).toBeTruthy();
  expect(api.enterSubjectQuiz).toHaveBeenCalledWith(
    "subject",
    "quiz",
    "S-12345678",
  );
  expect(api.startOrResumeAttempt).not.toHaveBeenCalled();
});
it("keeps wrong codes on the entry screen with an actionable error", async () => {
  api.enterSubjectQuiz.mockRejectedValue(
    Error("That code does not match this quiz and section."),
  );
  show();
  fireEvent.change(await screen.findByLabelText("Quiz code"), {
    target: { value: "WRONG" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "That code does not match this quiz and section.",
  );
  expect((screen.getByLabelText("Quiz code") as HTMLInputElement).value).toBe(
    "WRONG",
  );
  expect(api.startOrResumeAttempt).not.toHaveBeenCalled();
});
it("opens direct-entry quizzes without an unnecessary extra code prompt", async () => {
  api.getSubject.mockResolvedValue({
    ...room,
    quizzes: [
      { ...room.quizzes[0], require_access_code: false, access_code: "DIRECT" },
    ],
  });
  show();
  expect(
    await screen.findByRole("heading", { name: "Quiz instructions" }),
  ).toBeTruthy();
  expect(api.enterSubjectQuiz).not.toHaveBeenCalled();
});
it("handles unauthorized or missing subjects safely", async () => {
  api.getSubject.mockRejectedValue(Error("Forbidden"));
  show();
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
});
