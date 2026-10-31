import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QuizSharePanel } from "../src/components/teacher/QuizSharePanel";
import { QuizEditorPage } from "../src/pages/teacher/QuizEditorPage";
const api = vi.hoisted(() => ({
  getTeacherQuiz: vi.fn(),
  listQuestions: vi.fn(),
  listSections: vi.fn(),
  listClasses: vi.fn(),
  updateQuiz: vi.fn(),
  publishQuiz: vi.fn(),
}));
vi.mock("../src/api/client", () => ({ api }));
const section = {
  id: "s",
  quiz_id: "q",
  class_section_id: "class",
  name: "St. Vincent",
  access_code: "S-SECTION",
  created_at: "2026-10-01",
};
const quiz = {
  id: "q",
  title: "Science",
  status: "draft",
  access_code: "GLOBAL42",
  exam_format: "online",
  time_limit_minutes: 30,
  max_attempts: 1,
  version: 1,
};
beforeEach(() => {
  api.getTeacherQuiz.mockResolvedValue(quiz);
  api.listSections.mockResolvedValue([section]);
  api.listClasses.mockResolvedValue([]);
  api.listQuestions.mockResolvedValue([
    {
      id: "question",
      quiz_id: "q",
      type: "true_false",
      prompt: "Is this true?",
      points: 1,
      correct_answer: "true",
      order_index: 0,
    },
  ]);
  api.updateQuiz.mockResolvedValue(quiz);
  api.publishQuiz.mockResolvedValue({ ...quiz, status: "published" });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
const editor = () =>
  render(
    <MemoryRouter initialEntries={["/teacher/edit/q"]}>
      <Routes>
        <Route path="/teacher/edit/:id" element={<QuizEditorPage />} />
      </Routes>
    </MemoryRouter>,
  );
it("highlights section-specific codes instead of misleading students with the general quiz code", () => {
  render(
    <QuizSharePanel
      quizCode="GLOBAL42"
      sections={[
        section,
        { ...section, id: "t", name: "St. Filomena", access_code: "S-OTHER" },
      ]}
    />,
  );
  expect(screen.getByRole("region", { name: "Quiz share codes" })).toBeTruthy();
  expect(screen.getByText("S-SECTION")).toBeTruthy();
  expect(screen.getByText("S-OTHER")).toBeTruthy();
  expect(screen.queryByText("GLOBAL42")).toBeNull();
});
it("copies the exact displayed section code and confirms success", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  render(<QuizSharePanel quizCode="GLOBAL42" sections={[section]} />);
  fireEvent.click(
    screen.getByRole("button", { name: "Copy code for St. Vincent" }),
  );
  expect(await screen.findByText("Copied")).toBeTruthy();
  expect(writeText).toHaveBeenCalledWith("S-SECTION");
});
it("offers manual copying if clipboard permission is denied", async () => {
  vi.stubGlobal("navigator", {
    clipboard: { writeText: vi.fn().mockRejectedValue(Error("Denied")) },
  });
  render(<QuizSharePanel quizCode="GLOBAL42" sections={[]} />);
  fireEvent.click(
    screen.getByRole("button", { name: "Copy code for Quiz code" }),
  );
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "Unable to copy. Select the code and copy it manually.",
  );
  expect(screen.getByText("GLOBAL42")).toBeTruthy();
  expect(screen.queryByText("Copied")).toBeNull();
});
it("does not advertise a draft code before a successful publish", async () => {
  editor();
  await screen.findByRole("button", { name: "Save & publish" });
  expect(screen.queryByRole("region", { name: "Quiz share codes" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Save & publish" }));
  expect(
    await screen.findByRole("region", { name: "Quiz share codes" }),
  ).toBeTruthy();
  expect(api.publishQuiz).toHaveBeenCalledWith("q");
  expect(screen.getByText("S-SECTION")).toBeTruthy();
});
it("keeps published codes visible after reloading an existing quiz", async () => {
  api.getTeacherQuiz.mockResolvedValue({ ...quiz, status: "published" });
  editor();
  expect(await screen.findByText("S-SECTION")).toBeTruthy();
});
it("never shows a share panel after a failed publish", async () => {
  api.publishQuiz.mockRejectedValueOnce(Error("Publish failed"));
  editor();
  fireEvent.click(
    await screen.findByRole("button", { name: "Save & publish" }),
  );
  expect(await screen.findByText("Publish failed")).toBeTruthy();
  expect(screen.queryByRole("region", { name: "Quiz share codes" })).toBeNull();
});
it("keeps paper exams on their existing print-and-scan flow", async () => {
  api.getTeacherQuiz.mockResolvedValue({
    ...quiz,
    exam_format: "paper",
    status: "published",
  });
  editor();
  await screen.findByRole("button", { name: "Save & publish" });
  expect(screen.queryByRole("region", { name: "Quiz share codes" })).toBeNull();
});

it("lets the teacher switch quiz-code protection and saves the boolean setting", async () => {
  editor();
  const required = await screen.findByRole("radio", {
    name: /Require quiz code/,
  });
  expect(
    (
      screen.getByRole("radio", {
        name: /Open without code/,
      }) as HTMLInputElement
    ).checked,
  ).toBe(true);
  fireEvent.click(required);
  fireEvent.click(
    screen.getByRole("button", { name: "Save quiz", exact: true }),
  );
  await screen.findByText("Quiz saved.");
  expect(api.updateQuiz).toHaveBeenCalledWith(
    "q",
    expect.objectContaining({ require_access_code: true }),
  );
});
