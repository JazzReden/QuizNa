import { afterEach, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  PerformancePage,
  PerformanceChart,
} from "../src/pages/student/PerformancePage";
const getPerformance = vi.hoisted(() => vi.fn());
vi.mock("../src/api/client", () => ({
  api: { getStudentPerformance: getPerformance },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const renderPage = () =>
  render(
    <MemoryRouter>
      <PerformancePage />
    </MemoryRouter>,
  );
it("shows each subject and links its released result", async () => {
  getPerformance.mockResolvedValue({
    quizCount: 2,
    gradedCount: 1,
    percentage: 80,
    subjects: [
      {
        subject: "Science",
        gradedCount: 1,
        earned: 8,
        possible: 10,
        percentage: 80,
        quizzes: [
          {
            id: "q",
            title: "Cells",
            format: "online",
            state: "graded",
            score: 8,
            maxScore: 10,
            percentage: 80,
            attemptId: "attempt",
            completedAt: null,
          },
          {
            id: "e",
            title: "Essay",
            format: "paper",
            state: "awaiting_grading",
            score: null,
            maxScore: null,
            percentage: null,
            attemptId: "essay",
            completedAt: null,
          },
        ],
      },
    ],
  });
  renderPage();
  expect(await screen.findByRole("heading", { name: "Science" })).toBeTruthy();
  expect(screen.queryByRole("table")).toBeNull();
  fireEvent.click(screen.getByRole("link", { name: /Science/ }));
  expect(screen.getByText("8/10")).toBeTruthy();
  expect(screen.getByText("Awaiting grading")).toBeTruthy();
  expect(screen.getByRole("meter").getAttribute("aria-valuenow")).toBe("80");
  expect(
    screen
      .getByRole("link", { name: "View result for Cells" })
      .getAttribute("href"),
  ).toBe("/result/attempt");
});
it("explains legacy subject labels without inventing performance", async () => {
  getPerformance.mockResolvedValue({
    quizCount: 1,
    gradedCount: 0,
    percentage: null,
    subjects: [
      {
        subject: null,
        gradedCount: 0,
        earned: 0,
        possible: 0,
        percentage: null,
        quizzes: [
          {
            id: "q",
            title: "Quiz",
            format: "paper",
            state: "awaiting_release",
            score: null,
            maxScore: null,
            percentage: null,
            attemptId: "attempt",
            completedAt: null,
          },
        ],
      },
    ],
  });
  renderPage();
  expect(await screen.findByText("Subject not set")).toBeTruthy();
  fireEvent.click(screen.getByRole("link", { name: /Subject not set/ }));
  expect(screen.getByText("Awaiting release")).toBeTruthy();
  expect(screen.queryByRole("meter")).toBeNull();
});
it("provides an empty state", async () => {
  getPerformance.mockResolvedValue({
    quizCount: 0,
    gradedCount: 0,
    percentage: null,
    subjects: [],
  });
  renderPage();
  expect(await screen.findByText("Your progress starts here")).toBeTruthy();
});
it("retries after a network failure", async () => {
  getPerformance.mockRejectedValueOnce(new Error("offline")).mockResolvedValue({
    quizCount: 0,
    gradedCount: 0,
    percentage: null,
    subjects: [],
  });
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Your progress starts here")).toBeTruthy();
});

it("uses a labelled table and never displays an unreleased score", async () => {
  getPerformance.mockResolvedValue({
    quizCount: 1,
    gradedCount: 0,
    percentage: null,
    subjects: [
      {
        subject: "Research",
        gradedCount: 0,
        earned: 0,
        possible: 0,
        percentage: null,
        quizzes: [
          {
            id: "hidden",
            title: "Pending quiz",
            format: "online",
            state: "awaiting_release",
            score: 999,
            maxScore: 1000,
            percentage: 99.9,
            attemptId: "pending",
            completedAt: null,
          },
        ],
      },
    ],
  });
  renderPage();
  fireEvent.click(await screen.findByRole("link", { name: /Research/ }));
  expect(
    screen.getByRole("table", { name: "Research quiz scores" }),
  ).toBeTruthy();
  expect(screen.getByRole("columnheader", { name: "Score" })).toBeTruthy();
  expect(screen.getByText("Awaiting release")).toBeTruthy();
  expect(screen.queryByText("999/1000")).toBeNull();
  expect(screen.queryByText("99.9%")).toBeNull();
});

it("orders graph scores by completion, excludes hidden scores, and describes the latest change", () => {
  const quiz = {
    id: "a",
    title: "First",
    format: "online" as const,
    subject: "Science",
    state: "graded" as const,
    score: 6,
    maxScore: 10,
    percentage: 60,
    attemptId: "a",
    completedAt: "2026-10-01T00:00:00Z",
  };
  render(
    <PerformanceChart
      quizzes={[
        {
          ...quiz,
          id: "b",
          title: "Second",
          percentage: 80,
          completedAt: "2026-10-02T00:00:00Z",
        },
        {
          ...quiz,
          id: "hidden",
          title: "Hidden",
          state: "awaiting_release",
          percentage: 99,
        },
        quiz,
      ]}
    />,
  );
  expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
    "Released quiz scores in completion order: First: 60%, Second: 80%",
  );
  expect(
    screen.getByText("Up 20 percentage points from previous quiz"),
  ).toBeTruthy();
});
it("does not invent a trend for one result or an undated score", () => {
  render(<PerformanceChart quizzes={[]} />);
  expect(screen.getByText("More results needed for a trend")).toBeTruthy();
  expect(screen.queryByRole("img")).toBeNull();
});

it("describes declining scores without changing the stored values", () => {
  const quiz = {
    id: "a",
    title: "First",
    format: "online" as const,
    subject: "Science",
    state: "graded" as const,
    score: 9,
    maxScore: 10,
    percentage: 90,
    attemptId: "a",
    completedAt: "2026-10-01T00:00:00Z",
  };
  const next = {
    ...quiz,
    id: "b",
    title: "Second",
    percentage: 70,
    completedAt: "2026-10-02T00:00:00Z",
  };
  render(<PerformanceChart quizzes={[quiz, next]} />);
  expect(
    screen.getByText("Down 20 percentage points from previous quiz"),
  ).toBeTruthy();
  expect(quiz.percentage).toBe(90);
  expect(next.percentage).toBe(70);
});
