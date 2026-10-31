import { ConfigService } from "@nestjs/config";
import { GeminiEssayProvider } from "./gemini-essay.provider";
import { EssayAiProvider } from "./essay-ai.provider";
import { criteriaForQuestion, validateSuggestion } from "./essay-ai.policy";
const questions = [
  {
    questionId: "essay",
    number: 56,
    prompt: "Explain emotions.",
    points: 5,
    guide: "",
    ...criteriaForQuestion({ points: 5 }),
  },
];
const draft = () => ({
  essays: [
    {
      question_id: "essay",
      transcription: "I recognize my feelings.",
      legibility: "clear",
      feedback: "Relevant but brief.",
      criteria: [
        { criterion_index: 0, level: 0 },
        { criterion_index: 1, level: 1 },
        { criterion_index: 2, level: 0 },
      ],
    },
  ],
});
const completed = (text = JSON.stringify(draft())) => ({
  status: "completed",
  steps: [
    { type: "thought", content: [{ type: "text", text: "Not output" }] },
    { type: "model_output", content: [{ type: "text", text }] },
  ],
});
describe("Gemini essay drafts", () => {
  const oldFetch = global.fetch;
  afterEach(() => (global.fetch = oldFetch));
  const provider = (
    settings = { PAPER_AI_ENABLED: "true", GEMINI_API_KEY: "test-secret" },
  ) => new GeminiEssayProvider(new ConfigService(settings));
  it("sends the documented image/schema request with no tools, stored interaction or key in the URL", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => completed(),
      });
    const result = await provider().read(questions, [Buffer.from("crop")]);
    expect(validateSuggestion(result, questions).essays[0].suggestedScore).toBe(
      4.5,
    );
    const [url, options] = (fetch as jest.Mock).mock.calls[0];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
    );
    expect(url).not.toContain("test-secret");
    expect(options.headers["x-goog-api-key"]).toBe("test-secret");
    const body = JSON.parse(options.body);
    expect(body.model).toBe("gemini-3.8-flash");
    expect(body.store).toBe(false);
    expect(body.tools).toBeUndefined();
    expect(body.response_format).toMatchObject({
      type: "text",
      mime_type: "application/json",
      schema: { additionalProperties: false },
    });
    expect(body.input[2]).toEqual({
      type: "image",
      mime_type: "image/png",
      data: "Y3JvcA==",
    });
    expect(JSON.stringify(body)).not.toContain("test-secret");
  });
  it("requires a configured key and enabled flag", async () => {
    global.fetch = jest.fn();
    await expect(
      provider({
        PAPER_AI_ENABLED: "false",
        GEMINI_API_KEY: "test-secret",
      }).read(questions, []),
    ).rejects.toThrow("not enabled");
    await expect(
      provider({ PAPER_AI_ENABLED: "true", GEMINI_API_KEY: "" }).read(
        questions,
        [],
      ),
    ).rejects.toThrow("not enabled");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("returns quota feedback without automatic retry or provider fallback", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429 });
    await expect(
      provider().read(questions, [Buffer.from("crop")]),
    ).rejects.toMatchObject({ status: 429 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([
    "invalid key",
    "network",
    "incomplete",
    "refused",
    "malformed json",
  ])("handles %s without leaking provider details", async (failure) => {
    global.fetch = jest.fn().mockImplementation(async () => {
      if (failure === "network") throw Error("test-secret");
      return {
        ok: failure !== "invalid key",
        status: failure === "invalid key" ? 403 : 200,
        json: async () =>
          failure === "incomplete"
            ? { ...completed(), status: "incomplete" }
            : failure === "refused"
              ? {
                  status: "completed",
                  steps: [
                    {
                      type: "model_output",
                      content: [{ type: "refusal", text: "blocked" }],
                    },
                  ],
                }
              : completed("invalid json"),
      };
    });
    await expect(
      provider().read(questions, [Buffer.from("crop")]),
    ).rejects.toThrow("Essay reading is unavailable");
  });
});
describe("Explicit AI provider selection", () => {
  const fixture = (name: string | undefined) => {
    const openai = { enabled: true, model: "openai-model", read: jest.fn() },
      gemini = {
        enabled: true,
        model: "gemini-model",
        read: jest.fn(async () => draft()),
      };
    return {
      openai,
      gemini,
      service: new EssayAiProvider(
        new ConfigService(name ? { PAPER_AI_PROVIDER: name } : {}),
        openai as any,
        gemini as any,
      ),
    };
  };
  it("selects only Gemini and keeps Google disclosure visible", async () => {
    const { service, gemini, openai } = fixture("gemini");
    expect(service.name).toBe("gemini");
    expect(service.disclosure).toContain("Free-tier content");
    await service.read(questions, []);
    expect(gemini.read).toHaveBeenCalledTimes(1);
    expect(openai.read).not.toHaveBeenCalled();
  });
  it("does not fall back to a configured OpenAI key when Gemini is disabled", async () => {
    const { service, gemini, openai } = fixture("gemini");
    gemini.enabled = false;
    expect(service.enabled).toBe(false);
    await expect(service.read(questions, [])).rejects.toThrow("not enabled");
    expect(openai.read).not.toHaveBeenCalled();
  });
  it("does not fall back on Gemini errors", async () => {
    const { service, gemini, openai } = fixture("gemini");
    gemini.read.mockRejectedValueOnce(Error("quota"));
    await expect(service.read(questions, [])).rejects.toThrow("quota");
    expect(openai.read).not.toHaveBeenCalled();
  });
  it("fails closed on invalid configuration and preserves existing OpenAI installations", () => {
    expect(fixture("unknown").service.enabled).toBe(false);
    expect(fixture(undefined).service.name).toBe("openai");
  });
});
