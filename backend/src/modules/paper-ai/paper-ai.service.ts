import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { PaperService } from "../paper/paper.service";
import { DatabaseService } from "../../database/database.service";
import { EssayAiProvider } from "./essay-ai.provider";
import {
  criteriaForQuestion,
  EssayContext,
  validateCrop,
  validateSuggestion,
} from "./essay-ai.policy";
export interface EssayImage {
  buffer: Buffer;
  mimetype: string;
  size: number;
}
@Injectable()
export class PaperAiService {
  private active = 0;
  private perTeacher = new Map<string, { count: number; reset: number }>();
  private cache = new Map<
    string,
    { expires: number; result: Promise<ReturnType<typeof validateSuggestion>> }
  >();
  constructor(
    private paper: PaperService,
    private db: DatabaseService,
    private provider: EssayAiProvider,
  ) {}
  options() {
    return {
      enabled: this.provider.enabled,
      provider: this.provider.name,
      disclosure: this.provider.disclosure,
    };
  }
  async suggest(
    sheetId: string,
    pageIndex: number,
    teacherId: string,
    files: EssayImage[],
  ) {
    const sheet = await this.paper.get(sheetId, teacherId); // Ownership is checked before configuration or any provider call.
    if (sheet.attempt_id)
      throw new ConflictException(
        "This sheet is already saved. Grade its existing result.",
      );
    const page = sheet.layout.pages.find((page) => page.index === pageIndex);
    if (!page) throw new BadRequestException("Invalid answer-sheet page");
    const rows = page.rows.filter((row) => row.type === "essay");
    if (
      !rows.length ||
      rows.length > 8 ||
      !files ||
      files.length !== rows.length
    )
      throw new BadRequestException(
        "Include one cropped image for each essay on this page",
      );
    files.forEach((file) => validateCrop(file.buffer, file.mimetype));
    if (!this.provider.enabled)
      throw new ServiceUnavailableException(
        "Essay reading is not enabled. Enter written responses manually.",
      );
    const version = await this.db.getVersionForAttempt({
      quiz_id: sheet.quiz_id,
      quiz_version_id: sheet.quiz_version_id,
    } as any);
    const questions: EssayContext[] = rows.map((row) => {
      const q = version.snapshot_data.questions.find(
        (q) => q.id === row.questionId && q.type === "essay",
      );
      if (!q) throw new BadRequestException("The printed essay is unavailable");
      return {
        questionId: q.id,
        number: row.number,
        prompt: q.prompt,
        points: q.points,
        guide: q.rubric || "",
        ...criteriaForQuestion(q),
      };
    });
    const now = Date.now();
    for (const [key, item] of this.cache)
      if (item.expires < now) this.cache.delete(key);
    for (const [key, item] of this.perTeacher)
      if (item.reset < now) this.perTeacher.delete(key);
    const hash = createHash("sha256").update(
      teacherId +
        sheet.id +
        sheet.quiz_version_id +
        pageIndex +
        this.provider.name +
        ":" +
        this.provider.model,
    );
    files.forEach((file) => {
      hash.update(String(file.buffer.length) + ":");
      hash.update(file.buffer);
    });
    const key = hash.digest("hex"),
      cached = this.cache.get(key);
    if (cached) return cached.result;
    const budget = this.perTeacher.get(teacherId) || {
      count: 0,
      reset: now + 3600000,
    };
    if (budget.count >= 60 || this.active >= 2)
      throw new HttpException(
        "Essay reading is busy. Retry shortly.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    if (this.perTeacher.size >= 2000 && !this.perTeacher.has(teacherId))
      throw new HttpException(
        "Essay reading is busy. Retry shortly.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    budget.count++;
    this.perTeacher.set(teacherId, budget);
    this.active++;
    const result = this.provider
      .read(
        questions,
        files.map((file) => file.buffer),
      )
      .then((raw) => validateSuggestion(raw, questions))
      .catch((error) => {
        this.cache.delete(key);
        throw error;
      })
      .finally(() => {
        this.active--;
      });
    if (this.cache.size >= 64)
      this.cache.delete(this.cache.keys().next().value);
    this.cache.set(key, { expires: now + 300000, result });
    return result;
  }
}
