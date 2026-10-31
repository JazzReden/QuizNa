import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EssayContext, responseSchema } from "./essay-ai.policy";
import { ESSAY_REVIEW_INSTRUCTIONS } from "./essay-ai.prompt";
@Injectable()
export class GeminiEssayProvider {
  constructor(private config: ConfigService) {}
  get enabled() {
    return (
      this.config.get("PAPER_AI_ENABLED") === "true" &&
      !!this.config.get<string>("GEMINI_API_KEY")?.trim()
    );
  }
  get model() {
    return this.config.get<string>("GEMINI_ESSAY_MODEL") || "gemini-3.8-flash";
  }
  async read(questions: EssayContext[], images: Buffer[]): Promise<unknown> {
    if (!this.enabled)
      throw new ServiceUnavailableException(
        "Essay reading is not enabled. Enter written responses manually.",
      );
    const input: Record<string, unknown>[] = [
      { type: "text", text: JSON.stringify({ questions }) },
    ];
    questions.forEach((question, index) =>
      input.push(
        {
          type: "text",
          text: `Response crop for question_id=${question.questionId}; printed number=${question.number}.`,
        },
        {
          type: "image",
          mime_type: "image/png",
          data: images[index].toString("base64"),
        },
      ),
    );
    try {
      const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/interactions",
        {
          method: "POST",
          signal: AbortSignal.timeout(45000),
          headers: {
            "x-goog-api-key": this.config.get<string>("GEMINI_API_KEY")!.trim(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.model,
            store: false,
            system_instruction: ESSAY_REVIEW_INSTRUCTIONS,
            input,
            generation_config: {
              max_output_tokens: 8000,
              thinking_level: "low",
            },
            response_format: {
              type: "text",
              mime_type: "application/json",
              schema: responseSchema(
                questions.map((question) => question.questionId),
              ),
            },
          }),
        },
      );
      if (response.status === 429)
        throw new HttpException(
          "Essay reading quota reached. Wait and retry, or enter the response manually.",
          HttpStatus.TOO_MANY_REQUESTS,
        );
      if (!response.ok) throw Error("Unavailable");
      const body = (await response.json()) as any;
      if (body.status !== "completed" || !Array.isArray(body.steps))
        throw Error("Incomplete");
      const text = body.steps
        .filter(
          (step: any) =>
            step.type === "model_output" && Array.isArray(step.content),
        )
        .flatMap((step: any) => step.content)
        .filter(
          (part: any) => part.type === "text" && typeof part.text === "string",
        )
        .map((part: any) => part.text)
        .join("");
      if (!text || text.length > 100000) throw Error("Missing result");
      return JSON.parse(text);
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 429)
        throw error;
      throw new BadGatewayException(
        "Essay reading is unavailable. Retry or enter the response manually.",
      );
    }
  }
}
