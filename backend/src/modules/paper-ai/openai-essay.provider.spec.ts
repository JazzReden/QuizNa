import { ConfigService } from "@nestjs/config";
import { OpenAiEssayProvider } from "./openai-essay.provider";
import { criteriaForQuestion } from "./essay-ai.policy";
const question = {
  questionId: "q",
  number: 1,
  prompt: "Explain.",
  points: 5,
  guide: "",
  ...criteriaForQuestion({ points: 5 }),
};
describe("OpenAI essay provider", () => {
  const oldFetch = global.fetch;
  afterEach(() => {
    global.fetch = oldFetch;
  });
  const service = (enabled = true) =>
    new OpenAiEssayProvider(
      new ConfigService(
        enabled
          ? { PAPER_AI_ENABLED: "true", OPENAI_API_KEY: "server-test-key" }
          : {},
      ),
    );
  it("stays disabled without server configuration and never calls a provider", async () => {
    global.fetch = jest.fn();
    await expect(
      service(false).read([question], [Buffer.from("crop")]),
    ).rejects.toThrow("not enabled");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("sends cropped images with strict structured output and response storage disabled", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: '{"essays":[]}' }],
          },
        ],
      }),
    });
    await expect(
      service().read([question], [Buffer.from("crop")]),
    ).resolves.toEqual({ essays: [] });
    const [url, options] = (fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    const body = JSON.parse(options.body);
    expect(body.store).toBe(false);
    expect(body.text.format.strict).toBe(true);
    expect(body.input[0].content[2]).toMatchObject({
      type: "input_image",
      image_url: "data:image/png;base64,Y3JvcA==",
    });
    expect(options.headers.Authorization).toBe("Bearer server-test-key");
  });
  it.each(["refusal", "bad json", "network", "rate limit"])(
    "returns a safe error on %s",
    async (kind) => {
      global.fetch = jest.fn().mockImplementation(async () => {
        if (kind === "network") throw Error("server-test-key");
        return {
          ok: kind !== "rate limit",
          json: async () => ({
            status: kind === "refusal" ? "incomplete" : "completed",
            output: [
              {
                type: "message",
                content: [{ type: "output_text", text: "bad" }],
              },
            ],
          }),
        };
      });
      await expect(
        service().read([question], [Buffer.from("crop")]),
      ).rejects.toThrow("Essay reading is unavailable");
    },
  );
});
