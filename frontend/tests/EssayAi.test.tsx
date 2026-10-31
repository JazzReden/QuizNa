import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EssayAiReview } from "../src/components/teacher/EssayAiReview";
import {
  applyReviewedEssays,
  editTranscription,
  reviewedEssays,
  type EssayDraft,
} from "../src/utils/essay-ai-review";
import { cropEssays } from "../src/utils/paper-essay-crops";
import { QR_POINTS, pageMarkers, readMarks } from "../src/utils/paper-scan";
import { api } from "../src/api/client";
const draft: EssayDraft = {
  questionId: "essay",
  transcription: "I reflect.",
  legibility: "clear",
  suggestedScore: 4,
  maximum: 5,
  basis: "published",
  feedback: "Clear.",
  criteria: [
    { index: 0, name: "Content", points: 5, score: 4, level: "Proficient" },
  ],
  preview: "data:image/png;base64,fixture",
  score: "4",
  accepted: false,
  edited: false,
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});
describe("Essay review", () => {
  it("requires explicit score selection and invalidates the suggestion after transcription edits", () => {
    expect(
      reviewedEssays({ essay: draft }, { essay: draft.transcription }),
    ).toEqual([]);
    const accepted = { ...draft, accepted: true };
    expect(
      reviewedEssays({ essay: accepted }, { essay: draft.transcription })[0]
        .score,
    ).toBe(4);
    expect(editTranscription(accepted, "New text")).toMatchObject({
      accepted: false,
      score: "",
      edited: true,
    });
    expect(() =>
      reviewedEssays({ essay: accepted }, { essay: "Other text" }),
    ).toThrow();
  });
  it.each(["", "NaN", "6", "-1"])(
    "rejects invalid selected score %s",
    (score) => {
      expect(() =>
        reviewedEssays(
          { essay: { ...draft, accepted: true, score } },
          { essay: draft.transcription },
        ),
      ).toThrow();
    },
  );
  it("shows the source crop, text, criteria and explicit score checkbox", () => {
    const onChange = vi.fn(),
      onText = vi.fn();
    render(
      <EssayAiReview
        draft={draft}
        number={56}
        disabled={false}
        onText={onText}
        onChange={onChange}
      />,
    );
    expect(
      screen.getByAltText("Scanned response for question 56"),
    ).toBeTruthy();
    expect((screen.getByLabelText("Q56 score") as HTMLInputElement).type).toBe(
      "text",
    );
    fireEvent.change(screen.getByLabelText("Q56 transcription"), {
      target: { value: "Corrected" },
    });
    expect(onText).toHaveBeenCalledWith("Corrected");
    fireEvent.click(screen.getByLabelText("Use this score"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ accepted: true }),
    );
  });
  it("retries partial failures and skips a matching already-confirmed grade", async () => {
    const plan = {
      questionId: "essay",
      transcription: "I reflect.",
      score: 4,
      feedback: "Confirmed",
    };
    const client = {
      getAttemptAnswers: vi.fn(async () => [
        {
          id: "answer",
          question_id: "essay",
          answer: plan.transcription,
          is_manually_graded: false,
        },
      ]),
      gradeAnswer: vi
        .fn()
        .mockRejectedValueOnce(Error("Offline"))
        .mockResolvedValue({}),
    };
    expect(await applyReviewedEssays(client, "attempt", [plan])).toEqual([
      plan,
    ]);
    expect(await applyReviewedEssays(client, "attempt", [plan])).toEqual([]);
    expect(client.gradeAnswer).toHaveBeenLastCalledWith(
      "answer",
      4,
      "Confirmed",
      "I reflect.",
    );
    client.getAttemptAnswers.mockResolvedValue([
      {
        id: "answer",
        question_id: "essay",
        answer: plan.transcription,
        is_manually_graded: true,
        score_awarded: 4,
        teacher_feedback: "Confirmed",
      },
    ] as any);
    expect(await applyReviewedEssays(client, "attempt", [plan])).toEqual([]);
    expect(client.gradeAnswer).toHaveBeenCalledTimes(2);
  });
  it("preserves a different existing grade or changed saved response", async () => {
    const plan = {
      questionId: "essay",
      transcription: "I reflect.",
      score: 4,
      feedback: "Confirmed",
    };
    const client = {
      getAttemptAnswers: vi.fn(async () => [
        {
          id: "answer",
          question_id: "essay",
          answer: "changed",
          is_manually_graded: false,
        },
      ]),
      gradeAnswer: vi.fn(),
    };
    expect(await applyReviewedEssays(client, "attempt", [plan])).toEqual([
      plan,
    ]);
    client.getAttemptAnswers.mockResolvedValue([
      {
        id: "answer",
        question_id: "essay",
        answer: plan.transcription,
        is_manually_graded: true,
        score_awarded: 2,
      },
    ] as any);
    expect(await applyReviewedEssays(client, "attempt", [plan])).toEqual([
      plan,
    ]);
    expect(client.gradeAnswer).not.toHaveBeenCalled();
  });
  it("uploads multipart crops with authentication and lets the browser set the boundary", async () => {
    localStorage.setItem("quizna_token", "test-token");
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ essays: [] }), {
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await api.suggestPaperEssays("sheet", 0, [
      new Blob(["crop"], { type: "image/png" }),
    ]);
    const options = fetchMock.mock.calls[0][1] as any;
    expect(options.headers).toEqual({ Authorization: "Bearer test-token" });
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.body.get("sheet_id")).toBe("sheet");
    expect(options.body.getAll("images")).toHaveLength(1);
  });
});
describe("Essay-only image crops", () => {
  it.each([1414, 1529])(
    "aligns %s-height paper and excludes identity and QR headers",
    (height) => {
      const page: any = {
        index: 0,
        height,
        rows: [
          {
            questionId: "essay",
            number: 56,
            type: "essay",
            x: 650,
            width: 270,
            y: 350,
            height: 200,
            options: [],
          },
        ],
      };
      const width = 1000,
        data = new Uint8ClampedArray(width * height * 4).fill(255);
      const rect = (
        x: number,
        y: number,
        w: number,
        h: number,
        color: number[],
      ) => {
        for (let yy = y; yy < y + h; yy++)
          for (let xx = x; xx < x + w; xx++) {
            let i = (yy * width + xx) * 4;
            data[i] = color[0];
            data[i + 1] = color[1];
            data[i + 2] = color[2];
          }
      };
      pageMarkers(page).forEach((p) =>
        rect(p.x - 10, p.y - 10, 20, 20, [0, 0, 0]),
      );
      rect(100, 100, 500, 150, [255, 0, 0]);
      rect(655, 370, 260, 172, [0, 100, 200]);
      const location = {
        topLeftCorner: QR_POINTS[0],
        topRightCorner: QR_POINTS[1],
        bottomRightCorner: QR_POINTS[2],
        bottomLeftCorner: QR_POINTS[3],
      };
      const crops = cropEssays(data, width, height, location, page);
      expect(crops).toHaveLength(1);
      expect(crops[0]).toMatchObject({
        questionId: "essay",
        width: 520,
        height: 344,
      });
      let responsePixels = 0;
      for (let i = 0; i < crops[0].data.length; i += 4) {
        // A half-pixel marker centroid can leave a one-pixel white crop edge.
        expect(crops[0].data[i] === 255 && crops[0].data[i + 1] === 0).toBe(
          false,
        );
        if (crops[0].data[i + 2] === 200) responsePixels++;
      }
      expect(
        responsePixels / (crops[0].width * crops[0].height),
      ).toBeGreaterThan(0.98);
      expect(readMarks(data, width, height, location, page)[0].status).toBe(
        "written",
      );
    },
  );
  it("leaves objective-only pages untouched", () =>
    expect(
      cropEssays(new Uint8ClampedArray(0), 0, 0, {} as any, {
        index: 0,
        rows: [],
      }),
    ).toEqual([]));
});
