import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { KoalaHelp } from "../src/components/help/KoalaHelp";
import {
  ISHI_ANSWERS,
  findHelp,
  helpFor,
} from "../src/components/help/ishi-knowledge";
const account = vi.hoisted(() => ({
  user: { id: "teacher", role: "teacher" } as {
    id: string;
    role: string;
  } | null,
}));
vi.mock("../src/api/client", () => ({
  api: {
    getIshiOptions: vi.fn(async () => ({ quizzes: [] })),
    getIshiReport: vi.fn(),
  },
}));
vi.mock("../src/context/auth-context", () => ({
  useAuth: () => ({ user: account.user }),
}));
afterEach(() => {
  cleanup();
  account.user = { id: "teacher", role: "teacher" };
});
const show = (path = "/teacher") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <KoalaHelp />
    </MemoryRouter>,
  );
describe("Koala Help knowledge", () => {
  it("has at least 50 unique, nonempty help answers", () => {
    expect(ISHI_ANSWERS.length).toBeGreaterThanOrEqual(50);
    expect(new Set(ISHI_ANSWERS.map((a) => a.id)).size).toBe(
      ISHI_ANSWERS.length,
    );
    expect(new Set(ISHI_ANSWERS.map((a) => a.question)).size).toBe(
      ISHI_ANSWERS.length,
    );
    expect(ISHI_ANSWERS.every((a) => a.answer.trim().length > 30)).toBe(true);
  });
  it("limits suggestions to the signed-in role", () => {
    expect(helpFor("student").some((a) => a.role === "teacher")).toBe(false);
    expect(helpFor("teacher").some((a) => a.role === "student")).toBe(false);
    expect(helpFor("student").length).toBeGreaterThan(30);
  });
  it("finds product questions and refuses unrelated requests", () => {
    expect(findHelp("export gradebook CSV", "teacher")[0].question).toContain(
      "gradebook CSV",
    );
    expect(findHelp("internet disconnects", "student")[0].question).toContain(
      "disconnects",
    );
    expect(findHelp("draw a unicorn in space", "student")).toEqual([]);
  });
  it("answers every supported question exactly for its intended role", () => {
    for (const role of ["teacher", "student"] as const) {
      for (const answer of helpFor(role))
        expect(findHelp(answer.question, role)[0]?.id).toBe(answer.id);
    }
  });
  it("offers only technical help during quizzes", () => {
    expect(helpFor("student", true).every((a) => a.duringQuiz)).toBe(true);
    expect(findHelp("subject performance", "student", true)).toEqual([]);
    expect(
      findHelp("solve exam question", "student", true).some((a) =>
        a.answer.includes("cannot"),
      ),
    ).toBe(true);
  });
});
describe("Koala Help interface", () => {
  it("keeps the mascot accessible without a permanent text label", () => {
    show();
    const launcher = screen.getByRole("button", { name: "Ask Koala Help" });
    expect(launcher.getAttribute("aria-describedby")).toBe("ishi-launcher-tip");
    expect(screen.getByRole("tooltip").textContent).toBe("Koala Help");
    expect(screen.queryByText("QuizNa help")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Koala Help" })).toBeNull();
  });
  it("is hidden for signed-out visitors", () => {
    account.user = null;
    show();
    expect(screen.queryByRole("button", { name: "Ask Koala Help" })).toBeNull();
  });
  it("opens role-aware help and restores focus after Escape", () => {
    show();
    const launch = screen.getByRole("button", { name: "Ask Koala Help" });
    launch.focus();
    fireEvent.click(launch);
    expect(screen.getByRole("dialog", { name: "Koala Help" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Browse help" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(launch);
  });
  it("answers product help instantly without network requests", () => {
    const network = vi.spyOn(globalThis, "fetch");
    show();
    fireEvent.click(screen.getByRole("button", { name: "Ask Koala Help" }));
    fireEvent.change(screen.getByLabelText("Ask about QuizNa"), {
      target: { value: "export gradebook CSV" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ask question" }));
    expect(
      screen.getByText(/It exports the whole selected section/),
    ).toBeTruthy();
    expect(network).not.toHaveBeenCalled();
    network.mockRestore();
  });
  it("shows a concise fallback and opens more help on request", async () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Ask Koala Help" }));
    fireEvent.change(screen.getByLabelText("Ask about QuizNa"), {
      target: { value: "draw a unicorn in space" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ask question" }));
    expect(screen.getByText(/I do not have a reliable answer/)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "How do I create a quiz?" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Browse help" }));
    expect(
      screen.getByRole("button", { name: "How do I create a quiz?" }),
    ).toBeTruthy();
  });
  it("uses technical help for student attempts and cannot change answers", () => {
    account.user = { id: "student", role: "student" };
    show("/take/EXAMPLE");
    fireEvent.click(screen.getByRole("button", { name: "Ask Koala Help" }));
    expect(screen.getByText(/technical issues during your quiz/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Browse help" }));
    expect(
      screen.queryByRole("button", { name: "How do I grade an essay?" }),
    ).toBeNull();
    fireEvent.change(screen.getByLabelText("Ask about QuizNa"), {
      target: { value: "Can Koala Help solve the quiz for me?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ask question" }));
    expect(screen.getByText(/cannot provide correct answers/i)).toBeTruthy();
  });
});

it("keeps initial help short and relevant to the current page", () => {
  show("/teacher/paper/example");
  fireEvent.click(screen.getByRole("button", { name: "Ask Koala Help" }));
  const suggestions = screen.getByLabelText("Suggested questions");
  expect(suggestions.querySelectorAll("button")).toHaveLength(3);
  expect(suggestions.textContent).toContain(
    "How do I scan a paper answer sheet?",
  );
  expect(screen.queryByRole("button", { name: "Section totals" })).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "How do I scan a paper answer sheet?" }),
  );
  expect(screen.queryByLabelText("Suggested questions")).toBeNull();
});

describe("Expanded teacher/student guidance", () => {
  it("answers new draft, roster and QR identity intents including common typos", () => {
    expect(
      findHelp("can i add questions before saving", "teacher")[0]?.id,
    ).toBe("extra-teacher-0");
    expect(findHelp("find a studnet in a sction", "teacher")[0]?.id).toBe(
      "extra-teacher-7",
    );
    expect(["extra-teacher-12", "extra-teacher-13"]).toContain(
      findHelp("camera thinks this sheet is ella", "teacher")[0]?.id,
    );
    expect(
      findHelp("read handwritten name and section", "teacher")[0]?.id,
    ).toBe("extra-teacher-14");
    expect(findHelp("wifi pause timer", "student")[0]?.id).toBe(
      "extra-student-9",
    );
  });
  it("keeps new teacher guidance out of student and active-quiz results", () => {
    expect(
      findHelp("add questions before saving", "student").some(
        (a) => a.role === "teacher",
      ),
    ).toBe(false);
    expect(helpFor("student", true).every((a) => a.duringQuiz)).toBe(true);
    expect(
      findHelp("answer my calculus test for me", "student", true).some(
        (a) =>
          /answer key|solve/.test(a.answer) && !a.answer.includes("cannot"),
      ),
    ).toBe(false);
    expect(ISHI_ANSWERS.length).toBeGreaterThanOrEqual(130);
  });
});

it("offers a short choice for ambiguous questions instead of inventing a specific answer", () => {
  show();
  fireEvent.click(screen.getByRole("button", { name: "Ask Koala Help" }));
  fireEvent.change(screen.getByLabelText("Ask about QuizNa"), {
    target: { value: "code" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Ask question" }));
  expect(screen.getByText("Which one do you mean?")).toBeTruthy();
  const choices = screen.getByLabelText("Suggested questions");
  expect(choices.querySelectorAll("button")).toHaveLength(3);
  fireEvent.click(choices.querySelector("button")!);
  expect(screen.queryByText("Which one do you mean?")).toBeNull();
});
