import { afterEach, describe, expect, it, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
  act,
} from "@testing-library/react";
import { IshiLiveReports } from "../src/components/help/IshiLiveReports";
import { liveIntent, startIshiRefresh } from "../src/components/help/ishi-live";
const api = vi.hoisted(() => ({
  getIshiOptions: vi.fn(),
  getIshiReport: vi.fn(),
}));
vi.mock("../src/api/client", () => ({ api }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.resetAllMocks();
});
const report = (score = "8/10") => ({
  topic: "results",
  title: "My quiz results",
  summary: "Released scores",
  rows: [{ name: "Research", detail: score }],
  checkedAt: "2026-10-25T00:00:00Z",
  total: 1,
  truncated: false,
});
describe("Ishi polling lifecycle", () => {
  it("refreshes changed answers without overlapping and stops when closed", async () => {
    vi.useFakeTimers();
    const apply = vi.fn(),
      load = vi
        .fn()
        .mockResolvedValueOnce(report())
        .mockResolvedValue(report("9/10"));
    const stop = startIshiRefresh({
      load,
      apply,
      error: vi.fn(),
      canRun: () => true,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(apply.mock.calls[0][0].rows[0].detail).toBe("8/10");
    await vi.advanceTimersByTimeAsync(15000);
    expect(apply.mock.calls[1][0].rows[0].detail).toBe("9/10");
    stop();
    await vi.advanceTimersByTimeAsync(60000);
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("pauses hidden or offline and refreshes immediately on reconnect", async () => {
    vi.useFakeTimers();
    let connected = false;
    const load = vi.fn().mockResolvedValue(report());
    const stop = startIshiRefresh({
      load,
      apply: vi.fn(),
      error: vi.fn(),
      canRun: () => connected,
    });
    await vi.advanceTimersByTimeAsync(45000);
    expect(load).not.toHaveBeenCalled();
    connected = true;
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledOnce();
    stop();
  });
  it("does not overlap a slow request and aborts it on cleanup", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const load = vi.fn((s: AbortSignal) => {
      signal = s;
      return new Promise(() => {});
    });
    const stop = startIshiRefresh({
      load,
      apply: vi.fn(),
      error: vi.fn(),
      canRun: () => true,
    });
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(15000);
    expect(load).toHaveBeenCalledOnce();
    stop();
    expect(signal?.aborted).toBe(true);
  });
  it("bounds timeouts, backs off rate limits, and stops after revoked access", async () => {
    vi.useFakeTimers();
    const error = vi.fn(),
      load = vi
        .fn()
        .mockRejectedValueOnce({ status: 429 })
        .mockRejectedValue({ status: 403 });
    const stop = startIshiRefresh({
      load,
      error,
      apply: vi.fn(),
      canRun: () => true,
    });
    await vi.advanceTimersByTimeAsync(59000);
    expect(load).toHaveBeenCalledOnce();
    expect(load.mock.calls[0][0].aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(load).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(90000);
    expect(load).toHaveBeenCalledTimes(2);
    stop();
    const timeout = vi.fn();
    const end = startIshiRefresh({
      load: () => new Promise(() => {}),
      apply: vi.fn(),
      error: timeout,
      canRun: () => true,
    });
    await vi.advanceTimersByTimeAsync(20000);
    expect(timeout.mock.calls[0][0].message).toContain("timed out");
    end();
  });
});
describe("Ishi live interface", () => {
  it("routes natural report requests separately from how-to guidance", () => {
    expect(liveIntent("Who has not started?", "teacher")).toBe("not_started");
    expect(liveIntent("Who has not submitted?", "teacher")).toBe(
      "not_submitted",
    );
    expect(liveIntent("Show my subject performance", "student")).toBe(
      "performance",
    );
    expect(liveIntent("How do I export scores?", "teacher")).toBeNull();
    expect(liveIntent("Show who submitted", "student")).toBeNull();
  });
  it("shows released student reports and never sends another identity", async () => {
    api.getIshiReport.mockResolvedValue(report());
    render(<IshiLiveReports role="student" context="/student" />);
    fireEvent.click(screen.getByRole("button", { name: "My latest scores" }));
    expect(await screen.findByText("8/10")).toBeTruthy();
    expect(api.getIshiReport.mock.calls[0][0]).toEqual({ topic: "results" });
    expect(api.getIshiOptions).not.toHaveBeenCalled();
  });
  it("clears displayed scores when access fails on refresh", async () => {
    api.getIshiReport
      .mockResolvedValueOnce(report())
      .mockRejectedValue(new Error("Please sign in again."));
    render(<IshiLiveReports role="student" context="/student" />);
    fireEvent.click(screen.getByRole("button", { name: "My latest scores" }));
    await screen.findByText("8/10");
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByRole("alert");
    expect(screen.queryByText("8/10")).toBeNull();
  });
  it("requires a linked section for totals and clears reports when scope changes", async () => {
    api.getIshiOptions.mockResolvedValue({
      quizzes: [
        {
          id: "quiz",
          title: "Research",
          sections: [{ id: "section", name: "STEM A", classId: "class" }],
        },
      ],
    });
    api.getIshiReport.mockResolvedValue({ ...report(), topic: "gradebook" });
    render(<IshiLiveReports role="teacher" context="/teacher" />);
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Ishi report quiz") as HTMLSelectElement).value,
      ).toBe("quiz"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Section totals" }));
    expect(screen.getByRole("alert").textContent).toContain(
      "Choose a linked section",
    );
    expect(api.getIshiReport).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Ishi report section"), {
      target: { value: "section" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Section totals" }));
    await screen.findByText("8/10");
    expect(api.getIshiReport.mock.calls[0][0]).toEqual({
      topic: "gradebook",
      classId: "class",
    });
    fireEvent.change(screen.getByLabelText("Ishi report section"), {
      target: { value: "" },
    });
    expect(screen.queryByText("8/10")).toBeNull();
  });
  it("replaces previous reports and refreshes only the current topic", async () => {
    vi.useFakeTimers();
    api.getIshiReport.mockImplementation(async (plan) => ({
      ...report(),
      topic: plan.topic,
      title: plan.topic,
    }));
    render(<IshiLiveReports role="student" context="/student" />);
    fireEvent.click(screen.getByRole("button", { name: "My latest scores" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    fireEvent.click(
      screen.getByRole("button", { name: "My subject performance" }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const before = api.getIshiReport.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(api.getIshiReport.mock.calls.length - before).toBe(1);
    expect(screen.getAllByText("8/10")).toHaveLength(1);
  });
});

it("keeps report previews short and expands only when requested", async () => {
  api.getIshiReport.mockResolvedValue({
    ...report(),
    total: 7,
    rows: Array.from({ length: 7 }, (_, index) => ({
      name: `Quiz ${index + 1}`,
      detail: "8/10",
    })),
  });
  render(<IshiLiveReports role="student" context="/student" />);
  fireEvent.click(screen.getByRole("button", { name: "My latest scores" }));
  await screen.findByText("Quiz 1");
  expect(screen.getAllByRole("listitem")).toHaveLength(5);
  expect(screen.queryByText("Quiz 7")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Show 2 more" }));
  expect(screen.getAllByRole("listitem")).toHaveLength(7);
  fireEvent.click(screen.getByRole("button", { name: "Show fewer" }));
  expect(screen.getAllByRole("listitem")).toHaveLength(5);
});
