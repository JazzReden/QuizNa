import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PaperExamPage } from "../src/pages/teacher/PaperExamPage";
import { QuizEditorPage } from "../src/pages/teacher/QuizEditorPage";

const mocks = vi.hoisted(() => ({
  api: Object.fromEntries(
    [
      "suggestPaperEssays",
      "gradeAnswer",
      "paperAiOptions",
      "getTeacherQuiz",
      "listSections",
      "listPaperSheets",
      "preparePaperSection",
      "getPaperSheet",
      "getAttemptAnswers",
      "importQuestions",
      "publishQuiz",
      "savePaper",
      "resolvePaper",
      "listClasses",
      "createQuiz",
      "updateQuiz",
      "listQuestions",
      "attachClass",
    ].map((name) => [name, vi.fn()]),
  ),
  images: vi.fn(),
  cropPng: vi.fn(),
}));
vi.mock("../src/api/client", () => ({
  api: mocks.api,
  ApiError: class extends Error {},
}));
vi.mock("../src/utils/paper-print", () => ({
  answerSheetImages: mocks.images,
}));
vi.mock("../src/utils/paper-essay-crops", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/utils/paper-essay-crops")>()),
  cropPng: mocks.cropPng,
}));
vi.mock("../src/context/auth-context", () => ({
  useAuth: () => ({ user: { id: "teacher" } }),
}));

const id = "f0000000-0000-4000-8000-000000000001";
const question = {
  id: "f0000000-0000-4000-8000-000000000002",
  quiz_id: id,
  prompt: "Which planet is our home?",
  type: "mcq",
  points: 1,
  order_index: 0,
  options: [
    { id: "a", text: "Earth" },
    { id: "b", text: "Mars" },
  ],
};
const group = {
  id: "section",
  class_section_id: "class",
  name: "Grade 12 St. Vincent",
};
const sheet = {
  id: "sheet",
  quiz_id: id,
  quiz_version_id: "edition",
  section_id: group.id,
  token: "token",
  layout: {
    title: "Paper practice",
    student: "Ben Cruz",
    section: group.name,
    timeLimit: 20,
    instructions: "Fill bubbles",
    questions: [question],
    pages: [{ index: 0, rows: [] }],
  },
};
let quiz: any;
const metadata = [
  {
    id: sheet.id,
    student: sheet.layout.student,
    section: group.name,
    attempt_id: null,
    is_current_edition: true,
  },
];
const mountPaper = (query = "") =>
  render(
    <MemoryRouter initialEntries={[`/teacher/paper/${id}${query}`]}>
      <Routes>
        <Route path="/teacher/paper/:quizId" element={<PaperExamPage />} />
      </Routes>
    </MemoryRouter>,
  );
beforeEach(() => {
  vi.resetAllMocks();
  mocks.api.paperAiOptions.mockResolvedValue({ enabled: false });
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  quiz = {
    id,
    title: "Paper practice",
    exam_format: "paper",
    status: "published",
    version: 2,
    questions: [question],
    paper_has_unpublished_changes: false,
    release_scores_immediately: true,
  };
  mocks.api.getTeacherQuiz.mockImplementation(async () =>
    structuredClone(quiz),
  );
  mocks.api.listSections.mockResolvedValue([group]);
  mocks.api.listPaperSheets.mockResolvedValue(metadata);
  mocks.api.preparePaperSection.mockResolvedValue({
    sheet_ids: [sheet.id],
    skipped: [],
  });
  mocks.api.getPaperSheet.mockResolvedValue(sheet);
  mocks.api.getAttemptAnswers.mockResolvedValue([]);
  mocks.images.mockResolvedValue(["data:image/png;base64,fixture"]);
  mocks.api.listClasses.mockResolvedValue([]);
  mocks.api.listQuestions.mockResolvedValue([question]);
  mocks.api.publishQuiz.mockImplementation(async () => {
    quiz.paper_has_unpublished_changes = false;
    quiz.status = "published";
    return quiz;
  });
  mocks.api.createQuiz.mockImplementation(async (payload) => {
    quiz = { ...quiz, ...payload, status: "draft", questions: [] };
    return quiz;
  });
  mocks.api.updateQuiz.mockResolvedValue(quiz);
  mocks.api.importQuestions.mockImplementation(async () => {
    quiz = {
      ...quiz,
      questions: [...quiz.questions, { ...question, id: "added" }],
      paper_has_unpublished_changes: true,
    };
    return [{ ...question, id: "added" }];
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Paper Exam teacher controls", () => {
  it("opens the requested prepared student sheet directly with print controls ready", async () => {
    mountPaper("?sheet=sheet");
    await screen.findByRole("heading", { name: "Ben Cruz" });
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Print answer sheet",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    expect(mocks.api.getPaperSheet).toHaveBeenCalledWith("sheet");
    expect(
      (screen.getByLabelText("Prepared answer sheet") as HTMLSelectElement)
        .value,
    ).toBe("sheet");
    expect(mocks.api.savePaper).not.toHaveBeenCalled();
  });
  it("rejects a requested sheet outside the exam's prepared list", async () => {
    mountPaper("?sheet=foreign");
    expect(
      await screen.findByText(/This prepared sheet is unavailable/),
    ).not.toBeNull();
    expect(mocks.api.getPaperSheet).not.toHaveBeenCalled();
  });
  it("pastes and imports directly on the paper screen, then publishes before preparing papers", async () => {
    mountPaper();
    fireEvent.click(
      await screen.findByRole("button", { name: "Paste questions" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Paste questions",
    });
    fireEvent.change(within(dialog).getByLabelText("Questions and choices"), {
      target: {
        value: "1. Which planet is our home?\nA. Earth\nB. Mars\nAnswer: A",
      },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Organize & preview" }),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Add 1 question" }),
    );
    await waitFor(() =>
      expect(mocks.api.importQuestions).toHaveBeenCalledWith(
        id,
        expect.any(String),
        expect.arrayContaining([
          expect.objectContaining({ correct_answer: "opt_1" }),
        ]),
      ),
    );
    const publish = await screen.findByRole("button", {
      name: "Publish questions",
    });
    expect(
      (
        screen.getByRole("button", {
          name: "Prepare section",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(publish);
    await waitFor(() => expect(mocks.api.publishQuiz).toHaveBeenCalledWith(id));
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Prepare section",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
  });

  it("prepares and prints an entire roster using only the section, without email entry", async () => {
    mountPaper();
    fireEvent.click(
      await screen.findByRole("button", { name: "Prepare section" }),
    );
    await screen.findByText("1 student sheets ready.");
    expect(mocks.api.preparePaperSection).toHaveBeenCalledWith(
      id,
      group.id,
      "long_bond",
    );
    expect(screen.queryByLabelText(/email/i)).toBeNull();
    expect(
      screen.getByRole("button", { name: "Print QR answer sheets" }),
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Print question papers" }),
    ).not.toBeNull();
  });

  it("identifies an uploaded QR sheet, fills detected answers, and requires review before grading and saving", async () => {
    mocks.api.resolvePaper.mockResolvedValue({ sheet, page: 0 });
    mocks.api.savePaper.mockResolvedValue({
      id: "attempt",
      score: 1,
      max_score: 1,
      is_graded: true,
    });
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 1000, height: 1414, close: vi.fn() })),
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage() {},
      getImageData: () => ({
        data: new Uint8ClampedArray(4),
        width: 1,
        height: 1,
      }),
    } as any);
    vi.stubGlobal(
      "Worker",
      class {
        onmessage?: (event: any) => void;
        terminate() {}
        postMessage(message: any) {
          queueMicrotask(() =>
            this.onmessage?.({
              data: {
                code: "scanned-qr",
                marks: message.page
                  ? [{ questionId: question.id, answer: "a", status: "marked" }]
                  : null,
              },
            }),
          );
        }
      },
    );
    mountPaper();
    await screen.findByRole("button", { name: "Prepare section" });
    fireEvent.change(screen.getByLabelText("Upload answer sheet photo"), {
      target: {
        files: [new File(["fixture"], "sheet.png", { type: "image/png" })],
      },
    });
    await screen.findByText(/Page 1 read for Ben Cruz/);
    expect(mocks.api.resolvePaper).toHaveBeenCalledWith("scanned-qr");
    expect(screen.getByText("Q1: A")).not.toBeNull();
    const save = screen.getByRole("button", {
      name: "Grade & save",
    }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(
      screen.getByRole("checkbox", { name: /reviewed the answers/ }),
    );
    fireEvent.click(save);
    await screen.findByText("Saved: 1/1. Student score updated.");
    expect(mocks.api.savePaper).toHaveBeenCalledWith(sheet.id, [
      { question_id: question.id, answer: "a" },
    ]);
    expect(
      screen.getByRole("button", { name: "Scan next sheet" }),
    ).not.toBeNull();
  });

  it("shows the selected provider disclosure without changing the teacher confirmation gate", async () => {
    mocks.api.paperAiOptions.mockResolvedValue({
      enabled: true,
      provider: "gemini",
      disclosure:
        "Sends essay crops to Google Gemini. Use sample essays for testing.",
    });
    mountPaper();
    expect(
      await screen.findByText(
        "Sends essay crops to Google Gemini. Use sample essays for testing.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/Sends essay crops to OpenAI/)).toBeNull();
    expect(mocks.api.savePaper).not.toHaveBeenCalled();
    expect(mocks.api.gradeAnswer).not.toHaveBeenCalled();
  });
  it("reads essay drafts but saves scores only after the teacher selects and confirms them", async () => {
    const essay = {
      ...question,
      type: "essay",
      prompt: "Explain self-awareness.",
      points: 5,
      options: [],
    };
    const prepared = {
      ...sheet,
      layout: {
        ...sheet.layout,
        questions: [essay],
        pages: [
          {
            index: 0,
            rows: [
              {
                questionId: essay.id,
                number: 1,
                type: "essay",
                y: 350,
                height: 200,
                options: [],
              },
            ],
          },
        ],
      },
    };
    mocks.api.paperAiOptions.mockResolvedValue({ enabled: true });
    mocks.api.resolvePaper.mockResolvedValue({ sheet: prepared, page: 0 });
    mocks.api.getPaperSheet.mockResolvedValue(prepared);
    mocks.cropPng.mockResolvedValue({
      blob: new Blob(["crop"], { type: "image/png" }),
      preview: "data:image/png;base64,fixture",
    });
    mocks.api.suggestPaperEssays.mockResolvedValue({
      essays: [
        {
          questionId: essay.id,
          transcription: "I reflect on emotions.",
          legibility: "clear",
          suggestedScore: 4,
          maximum: 5,
          criteria: [
            {
              index: 0,
              name: "Content",
              points: 5,
              level: "Proficient",
              score: 4,
            },
          ],
          feedback: "Relevant explanation.",
          basis: "published",
        },
      ],
    });
    mocks.api.savePaper.mockResolvedValue({
      id: "essay-attempt",
      score: 0,
      max_score: 5,
      is_graded: false,
    });
    mocks.api.getAttemptAnswers.mockResolvedValue([
      {
        id: "essay-answer",
        question_id: essay.id,
        answer: "I reflect on emotions.",
        is_manually_graded: false,
      },
    ]);
    mocks.api.gradeAnswer.mockResolvedValue({});
    vi.stubGlobal("createImageBitmap", async () => ({
      width: 1000,
      height: 1414,
      close() {},
    }));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage() {},
      getImageData: () => ({
        data: new Uint8ClampedArray(4),
        width: 1,
        height: 1,
      }),
    } as any);
    vi.stubGlobal(
      "Worker",
      class {
        onmessage?: (event: any) => void;
        terminate() {}
        postMessage(message: any) {
          queueMicrotask(() =>
            this.onmessage?.({
              data: {
                code: "qr",
                marks: message.page
                  ? [{ questionId: essay.id, answer: null, status: "written" }]
                  : null,
                crops: message.page
                  ? [
                      {
                        questionId: essay.id,
                        number: 1,
                        width: 500,
                        height: 200,
                        data: new Uint8ClampedArray(4),
                      },
                    ]
                  : [],
              },
            }),
          );
        }
      },
    );
    mountPaper();
    await screen.findByRole("button", { name: "Prepare section" });
    const toggle = screen.getByRole("checkbox", {
      name: "Read essays with AI",
    });
    await waitFor(() =>
      expect((toggle as HTMLInputElement).disabled).toBe(false),
    );
    fireEvent.click(toggle);
    fireEvent.change(screen.getByLabelText("Upload answer sheet photo"), {
      target: {
        files: [new File(["fixture"], "sheet.png", { type: "image/png" })],
      },
    });
    const review = await screen.findByRole("region", {
      name: "Essay 1 review",
    });
    expect(
      (within(review).getByLabelText("Q1 transcription") as HTMLTextAreaElement)
        .value,
    ).toBe("I reflect on emotions.");
    expect(mocks.api.savePaper).not.toHaveBeenCalled();
    expect(mocks.api.gradeAnswer).not.toHaveBeenCalled();
    fireEvent.click(within(review).getByLabelText("Use this score"));
    fireEvent.click(
      screen.getByRole("checkbox", { name: /reviewed the answers/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Grade & save" }));
    await screen.findByText("Answers and confirmed essay scores saved.");
    expect(mocks.api.savePaper).toHaveBeenCalledWith(sheet.id, [
      { question_id: essay.id, answer: "I reflect on emotions." },
    ]);
    expect(mocks.api.gradeAnswer).toHaveBeenCalledWith(
      "essay-answer",
      4,
      "Content: 4/5 (Proficient)\nRelevant explanation.",
      "I reflect on emotions.",
    );
  });

  it("keeps earlier papers clearly labelled after publishing instead of silently changing their answer key", async () => {
    mocks.api.listPaperSheets.mockResolvedValue([
      { ...metadata[0], is_current_edition: false },
    ]);
    mountPaper();
    expect(
      await screen.findByText(/Some prepared sheets use earlier questions/),
    ).not.toBeNull();
    expect(
      screen.getByRole("option", { name: /Earlier paper/ }),
    ).not.toBeNull();
  });

  it("hides paper-only tools on online exams", async () => {
    quiz.exam_format = "online";
    mountPaper();
    await screen.findByText("Paper practice");
    expect(
      screen.queryByRole("button", { name: "Paste questions" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Prepare section" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Use camera" })).toBeNull();
  });
  it("keeps reviewed answers after a save failure and safely retries the same sheet", async () => {
    mocks.api.savePaper
      .mockRejectedValueOnce(new Error("Connection lost"))
      .mockResolvedValueOnce({
        id: "attempt",
        score: 1,
        max_score: 1,
        is_graded: true,
      });
    mountPaper();
    fireEvent.click(
      await screen.findByRole("button", { name: "Prepare section" }),
    );
    await screen.findByText("1 student sheets ready.");
    fireEvent.click(screen.getByText("Review or correct answers"));
    fireEvent.change(screen.getByLabelText("Q1. Which planet is our home?"), {
      target: { value: "a" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: /reviewed the answers/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Grade & save" }));
    await screen.findByRole("alert");
    expect(
      (
        screen.getByLabelText(
          "Q1. Which planet is our home?",
        ) as HTMLSelectElement
      ).value,
    ).toBe("a");
    fireEvent.click(screen.getByRole("button", { name: "Grade & save" }));
    await screen.findByText("Saved: 1/1. Student score updated.");
    expect(mocks.api.savePaper.mock.calls[0]).toEqual(
      mocks.api.savePaper.mock.calls[1],
    );
  });
  it("explains a blocked camera permission and retains photo upload", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi
          .fn()
          .mockRejectedValue(new DOMException("Blocked", "NotAllowedError")),
      },
    });
    mountPaper();
    fireEvent.click(await screen.findByRole("button", { name: "Use camera" }));
    expect(
      await screen.findByText(/Camera permission is blocked/),
    ).not.toBeNull();
    expect(screen.getByLabelText("Upload answer sheet photo")).not.toBeNull();
  });

  it("opens paste for a new paper exam without saving the draft first", async () => {
    render(
      <MemoryRouter initialEntries={["/teacher/create"]}>
        <Routes>
          <Route path="/teacher/create" element={<QuizEditorPage />} />
          <Route path="/teacher/edit/:id" element={<QuizEditorPage />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText("Quiz Title *"), {
      target: { value: "New paper quiz" },
    });
    fireEvent.click(screen.getByRole("radio", { name: /Paper Exam/ }));
    fireEvent.click(screen.getByRole("button", { name: "Paste questions" }));
    await screen.findByRole("dialog", { name: "Paste questions" });
    expect(mocks.api.createQuiz).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Quiz Title *") as HTMLInputElement).value).toBe("New paper quiz");
  });
});

it("opens the phone scanner with the rear camera and releases it when closed", async () => {
  const stop = vi.fn(),
    media = { getTracks: () => [{ stop }] } as unknown as MediaStream;
  const getUserMedia = vi.fn().mockResolvedValue(media);
  const descriptor = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  try {
    mountPaper();
    fireEvent.click(await screen.findByRole("button", { name: "Use camera" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Scan answer sheet",
    });
    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: false,
        video: expect.objectContaining({
          facingMode: { ideal: "environment" },
        }),
      }),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Close camera" }),
    );
    expect(stop).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("dialog", { name: "Scan answer sheet" }),
    ).toBeNull();
  } finally {
    if (descriptor)
      Object.defineProperty(navigator, "mediaDevices", descriptor);
    else Reflect.deleteProperty(navigator, "mediaDevices");
  }
});

it("shows saved scan progress for a multi-page sheet without repeating long instructions", async () => {
  const pages = Array.from({ length: 5 }, (_, index) => ({ index, rows: [] }));
  mocks.api.getPaperSheet.mockResolvedValue({
    ...sheet,
    layout: { ...sheet.layout, pages },
  });
  mocks.images.mockResolvedValue(
    pages.map(() => "data:image/png;base64,fixture"),
  );
  sessionStorage.setItem(
    "quizna-paper-review:teacher:sheet",
    JSON.stringify({
      version: "edition",
      updatedAt: Date.now(),
      values: { [question.id]: "a" },
      received: [0, 2],
    }),
  );
  mountPaper("?sheet=sheet");
  expect(await screen.findByText("2 / 5 pages scanned")).toBeTruthy();
  const progress = screen.getByRole("region", { name: "Scan progress" });
  expect(within(progress).getByText("Page 1 · Scanned")).toBeTruthy();
  expect(within(progress).getByText("Page 2 · Not scanned")).toBeTruthy();
  expect(
    within(progress).getByRole("button", { name: "Scan next page" }),
  ).toBeTruthy();
  expect(screen.queryByText(/No emails to enter/)).toBeNull();
});
it("lets teachers select A4 for new sheets without changing an existing QR layout", async () => {
  mountPaper();
  const size = await screen.findByLabelText("New sheet size");
  fireEvent.change(size, { target: { value: "a4" } });
  fireEvent.click(screen.getByRole("button", { name: "Prepare section" }));
  await screen.findByText("1 student sheets ready.");
  expect(mocks.api.preparePaperSection).toHaveBeenCalledWith(
    id,
    group.id,
    "a4",
  );
});
