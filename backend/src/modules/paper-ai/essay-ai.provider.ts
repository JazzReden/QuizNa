import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OpenAiEssayProvider } from "./openai-essay.provider";
import { GeminiEssayProvider } from "./gemini-essay.provider";
import { EssayContext } from "./essay-ai.policy";
@Injectable()
export class EssayAiProvider {
  constructor(
    private config: ConfigService,
    private openai: OpenAiEssayProvider,
    private gemini: GeminiEssayProvider,
  ) {}
  // Preserve existing installations, with explicit selection and no fallback between providers.
  get name() {
    const name = this.config.get<string>("PAPER_AI_PROVIDER") || "openai";
    return name === "openai" || name === "gemini" ? name : null;
  }
  private get selected() {
    return this.name === "gemini"
      ? this.gemini
      : this.name === "openai"
        ? this.openai
        : null;
  }
  get enabled() {
    return this.selected?.enabled ?? false;
  }
  get model() {
    return this.selected?.model || "disabled";
  }
  get disclosure() {
    return this.name === "gemini"
      ? "Sends essay crops to Google Gemini. Free-tier content may be used to improve Google products. Use sample essays for testing."
      : this.name === "openai"
        ? "Sends essay crops to OpenAI. Review the text and scores before saving."
        : "Essay reading is not enabled.";
  }
  async read(questions: EssayContext[], images: Buffer[]) {
    if (!this.selected || !this.enabled)
      throw new ServiceUnavailableException(
        "Essay reading is not enabled. Enter written responses manually.",
      );
    return this.selected.read(questions, images);
  }
}
