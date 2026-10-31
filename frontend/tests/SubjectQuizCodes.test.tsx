import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SubjectQuizList } from "../src/components/subjects/SubjectQuizList";
const detail = {
  id: "subject",
  class_section_id: "class",
  quizzes: [
    {
      id: "quiz",
      title: "Science quiz",
      status: "published",
      exam_format: "online",
      access_code: "S-VINCENT",
      time_limit_minutes: 30,
      attempts: [],
    },
  ],
} as any;
const show = (teacher = true, value = detail) =>
  render(
    <MemoryRouter>
      <SubjectQuizList detail={value} teacher={teacher} />
    </MemoryRouter>,
  );
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("keeps the section quiz code visible outside the editor and after remounting", () => {
  const first = show();
  expect(screen.getByText("S-VINCENT")).toBeTruthy();
  first.unmount();
  show();
  expect(screen.getByText("S-VINCENT")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Open quiz" })).toBeTruthy();
});
it("copies the stored section code without updating the quiz", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  show();
  fireEvent.click(
    screen.getByRole("button", { name: "Copy quiz code for Science quiz" }),
  );
  expect(await screen.findByText("Quiz code copied.")).toBeTruthy();
  expect(writeText).toHaveBeenCalledWith("S-VINCENT");
});
it("offers manual copying if clipboard access fails", async () => {
  vi.stubGlobal("navigator", {
    clipboard: { writeText: vi.fn().mockRejectedValue(Error("Denied")) },
  });
  show();
  fireEvent.click(
    screen.getByRole("button", { name: "Copy quiz code for Science quiz" }),
  );
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.getByText("S-VINCENT")).toBeTruthy();
});
it("does not add teacher share controls to student, draft or paper views", () => {
  const student = show(false);
  expect(screen.queryByRole("button", { name: /Copy quiz code/ })).toBeNull();
  student.unmount();
  show(true, {
    ...detail,
    quizzes: [
      { ...detail.quizzes[0], status: "draft" },
      { ...detail.quizzes[0], id: "paper", exam_format: "paper" },
    ],
  });
  expect(screen.queryByRole("button", { name: /Copy quiz code/ })).toBeNull();
  expect(screen.queryByText("S-VINCENT")).toBeNull();
});

it("routes protected quizzes through code entry and keeps active attempts resumable", () => {
  const protectedDetail = {
    ...detail,
    quizzes: [
      {
        ...detail.quizzes[0],
        require_access_code: true,
        access_code: undefined,
      },
    ],
  };
  const first = show(false, protectedDetail);
  expect(
    screen.getByRole("link", { name: "Take quiz" }).getAttribute("href"),
  ).toBe("/student/subjects/subject/quiz/quiz");
  first.unmount();
  show(false, {
    ...detail,
    quizzes: [
      {
        ...detail.quizzes[0],
        require_access_code: true,
        can_start: false,
        attempts: [{ status: "in_progress", attempt_number: 1 }],
      },
    ],
  });
  expect(
    screen.getByRole("link", { name: "Resume quiz" }).getAttribute("href"),
  ).toBe("/take/S-VINCENT");
});

it("removes quiz-opening links at the attempt limit while keeping results", () => {
  show(false, {
    ...detail,
    quizzes: [
      {
        ...detail.quizzes[0],
        require_access_code: true,
        access_code: undefined,
        can_start: false,
        attempts: [{ id: "done", status: "submitted", attempt_number: 1 }],
      },
    ],
  });
  for (const name of ["Science quiz", "Open quiz"]) {
    expect(screen.queryByRole("link", { name, exact: true })).toBeNull();
  }
  expect(
    screen.getByRole("link", { name: "Review result" }).getAttribute("href"),
  ).toBe("/result/done");
  expect(screen.getByText("Attempt limit reached")).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Take quiz" })).toBeNull();
});

it("explains closed dates without an opening action", () => {
  show(false, {
    ...detail,
    quizzes: [
      {
        ...detail.quizzes[0],
        can_start: false,
        available_until: "2020-01-01T00:00:00.000Z",
      },
    ],
  });
  expect(screen.getByText("Quiz closed")).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Open quiz" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Science quiz" })).toBeNull();
});
