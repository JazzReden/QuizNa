import { ESSAY_REVIEW_INSTRUCTIONS } from "./essay-ai.prompt";
import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EssayContext, responseSchema } from "./essay-ai.policy";
@Injectable()
export class OpenAiEssayProvider {
  constructor(private config: ConfigService) {}
  get enabled() {
    return (
      this.config.get("PAPER_AI_ENABLED") === "true" &&
      !!this.config.get<string>("OPENAI_API_KEY")?.trim()
    );
  }
  get model() {
    return this.config.get<string>("OPENAI_ESSAY_MODEL") || "gpt-5.6-terra";
  }
  async read(questions: EssayContext[], images: Buffer[]): Promise<unknown> {
    if (!this.enabled)
      throw new ServiceUnavailableException(
        "Essay reading is not enabled. Enter written responses manually.",
      );
    const content: any[] = [
      {
        type: "input_text",
        text: JSON.stringify({
          questions: questions.map((q) => ({
            ...q,
            levels: [
              "Excellent: 100%",
              "Proficient: 75%",
              "Developing: 50%",
              "Beginning: 25%",
              "No evidence: 0%",
            ],
          })),
        }),
      },
    ];
    questions.forEach((q, index) => {
      content.push(
        {
          type: "input_text",
          text: `Answer crop for question_id=${q.questionId}; printed question number=${q.number}.`,
        },
        {
          type: "input_image",
          detail: "high",
          image_url:
            "data:image/png;base64," + images[index].toString("base64"),
        },
      );
    });
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        signal: AbortSignal.timeout(45000),
        headers: {
          Authorization: "Bearer " + this.config.get("OPENAI_API_KEY"),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          store: false,
          max_output_tokens: 8000,
          instructions: ESSAY_REVIEW_INSTRUCTIONS,
          input: [{ role: "user", content }],
          text: {
            format: {
              type: "json_schema",
              name: "essay_review",
              strict: true,
              schema: responseSchema(questions.map((q) => q.questionId)),
            },
          },
        }),
      });
      if (!response.ok) throw new Error("Provider unavailable");
      const body = (await response.json()) as any;
      if (body.status !== "completed" || !Array.isArray(body.output))
        throw new Error("Incomplete response");
      const text = body.output
        .flatMap((item: any) =>
          item.type === "message" && Array.isArray(item.content)
            ? item.content
            : [],
        )
        .filter((item: any) => item.type === "output_text")
        .map((item: any) => item.text)
        .join("");
      if (!text || text.length > 100000) throw new Error("Missing response");
      return JSON.parse(text);
    } catch {
      throw new BadGatewayException(
        "Essay reading is unavailable. Retry or enter the response manually.",
      );
    }
  }
}
