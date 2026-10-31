import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { act, render, renderHook, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  announceResultsChange,
  useAutoRefresh,
} from "../src/hooks/useAutoRefresh";
import { StudentDashboard } from "../src/pages/student/StudentDashboard";
import { SubjectsPage } from "../src/pages/subjects/SubjectsPage";

const api = vi.hoisted(() => ({
  getMyAttempts: vi.fn(),
  listTeacherQuizzes: vi.fn(),
  listSubjects: vi.fn(),
  listClasses: vi.fn(),
}));
vi.mock("../src/api/client", () => ({ api }));
vi.mock("../src/context/auth-context", () => ({
  useAuth: () => ({ user: { role: "teacher" } }),
}));
beforeEach(() => {
  vi.resetAllMocks();
  api.listClasses.mockResolvedValue([]);
  api.listTeacherQuizzes.mockResolvedValue([]);
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Automatic result refresh", () => {
  it("refreshes visible dashboards, pauses hidden pages, avoids overlapping requests and cleans up", async () => {
    let complete!: () => void;
    const pending = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const refresh = vi
      .fn()
      .mockReturnValueOnce(pending)
      .mockResolvedValue(undefined);
    const { unmount } = renderHook(() => useAutoRefresh(refresh));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    act(() => {
      window.dispatchEvent(new Event("focus"));
      announceResultsChange();
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => complete());
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(refresh).toHaveBeenCalledTimes(2);
    unmount();
    await vi.advanceTimersByTimeAsync(10000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("shows a newly saved released paper score on the student's already-open dashboard", async () => {
    api.getMyAttempts.mockResolvedValue([]);
    const view = render(
      <MemoryRouter>
        <StudentDashboard />
      </MemoryRouter>,
    );
    await act(async () => {});
    api.getMyAttempts.mockResolvedValue([
      {
        id: "saved",
        attempt_number: 1,
        started_at: "2026-10-21T00:00:00Z",
        status: "submitted",
        score: 10,
        max_score: 10,
        is_graded: true,
        warning_count: 0,
        quiz: { title: "Scanned science paper", exam_format: "paper" },
      },
    ]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(screen.getByText("Scanned science paper")).not.toBeNull();
    expect(screen.getByText("10 / 10 pts")).not.toBeNull();
    expect(screen.getByText("Paper Exam")).not.toBeNull();
    view.unmount();
  });

  it("refreshes the current teacher subject dashboard on result-change events", async () => {
    api.listSubjects.mockResolvedValue([
      { id: "one", name: "Science", section_name: "Vincent" },
    ]);
    const view = render(
      <MemoryRouter>
        <SubjectsPage />
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(
      screen.getByRole("link", { name: /Science.*Vincent/ }),
    ).not.toBeNull();
    api.listSubjects.mockResolvedValue([
      { id: "one", name: "Science", section_name: "Vincent" },
      { id: "two", name: "Research", section_name: "Vincent" },
    ]);
    await act(async () => announceResultsChange());
    expect(
      screen.getByRole("link", { name: /Research.*Vincent/ }),
    ).not.toBeNull();
    view.unmount();
  });
});

it("pauses offline and coalesces repeated focus events", async () => {
  const refresh = vi.fn().mockResolvedValue(undefined);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  const { unmount } = renderHook(() => useAutoRefresh(refresh));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000);
  });
  expect(refresh).not.toHaveBeenCalled();
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  await act(async () => {
    window.dispatchEvent(new Event("online"));
  });
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
  });
  expect(refresh).toHaveBeenCalledTimes(1);
  unmount();
});
