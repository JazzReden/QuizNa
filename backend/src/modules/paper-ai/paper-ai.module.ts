import { Module } from "@nestjs/common";
import { PaperModule } from "../paper/paper.module";
import { PaperAiController } from "./paper-ai.controller";
import { PaperAiService } from "./paper-ai.service";
import { OpenAiEssayProvider } from "./openai-essay.provider";
import { GeminiEssayProvider } from "./gemini-essay.provider";
import { EssayAiProvider } from "./essay-ai.provider";
@Module({
  imports: [PaperModule],
  controllers: [PaperAiController],
  providers: [
    PaperAiService,
    OpenAiEssayProvider,
    GeminiEssayProvider,
    EssayAiProvider,
  ],
})
export class PaperAiModule {}
