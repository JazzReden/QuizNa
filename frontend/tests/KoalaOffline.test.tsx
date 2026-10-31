import { describe, expect, it } from "vitest";
import {
  ISHI_ANSWERS,
  KOALA_QUESTION_CATALOG,
  findHelp,
  helpFor,
  needsHelpChoice,
} from "../src/components/help/ishi-knowledge";
import { normalizeQuestion } from "../src/components/help/koala-offline";
import { liveIntent } from "../src/components/help/ishi-live";

describe("expanded offline question catalog", () => {
  it("provides at least 1,000 supported phrasings and substantial coverage for both roles", () => {
    expect(new Set(KOALA_QUESTION_CATALOG.map(p => normalizeQuestion(p.question))).size).toBeGreaterThanOrEqual(1000);
    for (const role of ["teacher", "student"] as const) {
      const phrases = KOALA_QUESTION_CATALOG.filter(
        (p) => p.role === role || p.role === "both",
      );
      expect(phrases.length).toBeGreaterThanOrEqual(500);
    }
    console.info(
      `Koala offline: ${ISHI_ANSWERS.length} reviewed answers, ${KOALA_QUESTION_CATALOG.length} supported question phrasings.`,
    );
  });
  it("maps every catalog phrase to its reviewed answer for the permitted role", () => {
    for (const phrase of KOALA_QUESTION_CATALOG) {
      const roles =
        phrase.role === "both"
          ? (["teacher", "student"] as const)
          : [phrase.role];
      for (const role of roles) {
        expect(
          findHelp(phrase.question, role).map((a) => a.id),
          phrase.question,
        ).toContain(phrase.answerId);
      }
    }
  });
  it("keeps canonical questions unique and never includes a missing answer target", () => {
    expect(
      new Set(ISHI_ANSWERS.map((a) => normalizeQuestion(a.question))).size,
    ).toBe(ISHI_ANSWERS.length);
    const ids = new Set(ISHI_ANSWERS.map((a) => a.id));
    expect(KOALA_QUESTION_CATALOG.every((p) => ids.has(p.answerId))).toBe(true);
  });
  it("recognizes practical Cebuano and conversational questions", () => {
    expect(
      findHelp("unsa kalahi sa subject ug section", "teacher")[0]?.id,
    ).toBe("offline-0");
    expect(findHelp("asa ibutang ang subject code", "student")[0]?.id).toBe(
      "offline-16",
    );
    expect(findHelp("niubos akong graph", "student")[0]?.answer).toContain(
      "lower",
    );
    expect(
      findHelp("graded pero wala sa gradebook", "teacher")[0]?.answer,
    ).toContain("confirmation");
    expect(
      findHelp("what are the numbers below the graph", "student")[0]?.answer,
    ).toContain("completion date");
  });
  it("retains typo correction and rejects unsupported general-knowledge requests", () => {
    expect(findHelp("find a studnet in a sction", "teacher")[0]?.id).toBe(
      "extra-teacher-7",
    );
    expect(findHelp("draw a unicorn in space", "student")).toEqual([]);
    expect(findHelp("who won the world cup in 2040", "teacher")).toEqual([]);
  });
  it("does not offer teacher-only help to students or nontechnical help during attempts", () => {
    const teacherOnly = KOALA_QUESTION_CATALOG.filter(
      (p) => p.role === "teacher",
    );
    for (const phrase of teacherOnly.slice(0, 50)) {
      expect(
        findHelp(phrase.question, "student").every((a) => a.role !== "teacher"),
      ).toBe(true);
    }
    expect(
      findHelp("unsaon pag open sa graph sa subject", "student", true),
    ).toEqual([]);
    expect(helpFor("student", true).every((a) => a.duringQuiz)).toBe(true);
  });
  it("asks users to choose for a broad ambiguous topic", () => {
    const matches = findHelp("code", "teacher");
    expect(matches.length).toBeGreaterThan(1);
    expect(needsHelpChoice("code", matches)).toBe(true);
    expect(needsHelpChoice(matches[0].question, matches)).toBe(false);
  });
  it("separates explanations from authorized live-record questions", () => {
    expect(
      liveIntent("Why is my performance graph going down?", "student"),
    ).toBeNull();
    expect(
      liveIntent("How is my subject percentage calculated?", "student"),
    ).toBeNull();
    expect(liveIntent("show my performance", "student")).toBe("performance");
    expect(liveIntent("kinsay wala pa nagsugod", "teacher")).toBe(
      "not_started",
    );
    expect(liveIntent("ipakita akong grado", "student")).toBe("results");
  });
});
