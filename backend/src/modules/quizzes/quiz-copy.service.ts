import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { randomBytes, randomUUID } from "node:crypto";
import { v5 } from "uuid";
import { DatabaseService } from "../../database/database.service";
import { Quiz } from "../../common/types";
import { SubjectRoom } from "../subjects/subjects.types";

@Injectable()
export class QuizCopyService {
  constructor(private readonly db: DatabaseService) {}

  async copy(
    sourceId: string,
    teacherId: string,
    targetId: string,
    requestId: string,
  ): Promise<Quiz> {
    const id = v5(
      `quiz-copy:${teacherId}:${sourceId}:${targetId}:${requestId}`,
      v5.URL,
    );
    if (this.db.isLive)
      return this.db.copyQuizLive(sourceId, teacherId, targetId, id);
    return this.db.withLock(`quiz-copy:${id}`, async () => {
      const source = await this.db.getQuizById(sourceId);
      const target = (
        await this.db.subjectRecords<SubjectRoom>("subjects", { id: targetId })
      )[0];
      if (
        !source ||
        source.teacher_id !== teacherId ||
        !target ||
        target.teacher_id !== teacherId
      )
        throw new ForbiddenException(
          "Choose one of your own quizzes and subjects.",
        );
      const section = await this.db.getClass(target.class_section_id);
      if (!section || section.teacher_id !== teacherId)
        throw new ForbiddenException("Section unavailable.");
      if (
        (await this.db.listSections(sourceId)).some(
          (s) => s.class_section_id === section.id,
        )
      )
        throw new BadRequestException("Choose a different section.");
      const existing = await this.db.getQuizById(id);
      if (existing) return existing;
      const questions = await this.db.listQuestions(sourceId);
      let created = false;
      try {
        const quiz = await this.db.createQuiz({
          id,
          teacher_id: teacherId,
          title: source.title,
          subject: target.name,
          exam_format: source.exam_format || "online",
          description: source.description,
          instructions: source.instructions,
          require_access_code: !!source.require_access_code,
          time_limit_minutes: source.time_limit_minutes,
          max_attempts: source.max_attempts,
          randomize_questions: source.randomize_questions,
          randomize_options: source.randomize_options,
          release_scores_immediately: false,
          release_answers_immediately: false,
          access_code: randomBytes(6).toString("hex").toUpperCase(),
          status: "draft",
          version: 1,
        });
        created = true;
        const now = new Date().toISOString();
        await this.db.createQuestionBatch(
          questions.map((q) => ({
            ...q,
            id: randomUUID(),
            quiz_id: id,
            created_at: now,
            updated_at: now,
          })),
        );
        await this.db.createSection({
          id: randomUUID(),
          quiz_id: id,
          class_section_id: section.id,
          name: section.name,
          access_code: `S-${randomBytes(4).toString("hex").toUpperCase()}`,
          created_at: now,
        });
        await this.db.saveSubjectRecord("subjectQuizzes", {
          id: randomUUID(),
          subject_id: target.id,
          quiz_id: id,
          class_section_id: section.id,
          created_at: now,
        });
        return quiz;
      } catch (error) {
        // MySQL rolls the transaction back; memory mode needs explicit cleanup.
        if (created && !this.db.isMysql) await this.db.discardQuizCopy(id);
        throw error;
      }
    });
  }
}
