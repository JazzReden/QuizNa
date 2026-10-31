import { validateEssayCriteria } from "./essay-criteria";
import { v5 as uuidv5 } from "uuid";
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { DatabaseService } from "../../database/database.service";
import { Question } from "../../common/types";
import {
  CreateQuestionDto,
  UpdateQuestionDto,
  ImportQuestionsDto,
} from "./questions.dto";

@Injectable()
export class QuestionsService {
  constructor(private db: DatabaseService) {}

  private validateQuestionData(
    type: string,
    options?: any[],
    correctAnswer?: any,
  ) {
    if (type === "mcq") {
      if (!options || options.length < 2 || options.length > 8) {
        throw new BadRequestException(
          "Multiple-choice questions must have at least 2 options",
        );
      }
      if (
        !options.every(
          (o) =>
            o &&
            typeof o.id === "string" &&
            o.id.length > 0 &&
            o.id.length <= 40 &&
            typeof o.text === "string" &&
            o.text.trim() &&
            o.text.length <= 4000,
        ) ||
        new Set(options.map((o) => o.id)).size !== options.length ||
        !options.some((o) => o.id === correctAnswer)
      ) {
        throw new BadRequestException(
          "Multiple-choice questions must define a correct answer option ID",
        );
      }
    } else if (type === "true_false") {
      if (
        correctAnswer === undefined ||
        correctAnswer === null ||
        (correctAnswer !== "opt_true" &&
          correctAnswer !== "opt_false" &&
          typeof correctAnswer !== "boolean")
      ) {
        throw new BadRequestException(
          "True/False questions must specify True or False as the correct answer",
        );
      }
    } else if (type === "short_answer") {
      const accepted = Array.isArray(correctAnswer)
        ? correctAnswer
        : [correctAnswer];
      if (
        !accepted.length ||
        accepted.length > 20 ||
        !accepted.every(
          (answer) =>
            typeof answer === "string" &&
            answer.trim() &&
            answer.length <= 4000,
        )
      ) {
        throw new BadRequestException(
          "Short-answer questions need 1 to 20 accepted text answers",
        );
      }
    }
  }

  async listByQuiz(quizId: string, teacherId: string): Promise<Question[]> {
    const quiz = await this.db.getQuizById(quizId);
    if (!quiz) throw new NotFoundException("Quiz not found");
    if (quiz.teacher_id !== teacherId)
      throw new ForbiddenException("You do not own this quiz");

    return this.db.listQuestions(quizId);
  }

  async saveDraftBatch(teacherId: string, rows: CreateQuestionDto[]): Promise<Question[]> {
    if (!rows.length || rows.length > 100 || rows.some(q => !q.client_question_id || q.quiz_id !== rows[0].quiz_id)
      || new Set(rows.map(q=>q.client_question_id)).size !== rows.length)
      throw new BadRequestException('Use up to 100 unique draft questions for one quiz');
    return this.db.withLock(`draft-batch:${rows[0].quiz_id}`, async () => {
      const quiz = await this.db.getQuizById(rows[0].quiz_id);
      if (!quiz) throw new NotFoundException('Quiz not found');
      if (quiz.teacher_id !== teacherId) throw new ForbiddenException('You do not own this quiz');
      // Validate every answer and rubric before storing any row.
      for (const q of rows) {
        this.validateQuestionData(q.type, q.options, q.correct_answer);
        validateEssayCriteria(q.rubric, q.type, q.points);
      }
      const saved: Question[] = [];
      for (const q of rows) saved.push(await this.create(teacherId, q));
      return saved;
    });
  }

  async create(teacherId: string, dto: CreateQuestionDto): Promise<Question> {
    const { client_question_id, ...values } = dto;
    if (!client_question_id) return this.createStored(teacherId, values);
    const id = uuidv5(`question-draft:${teacherId}:${dto.quiz_id}:${client_question_id}`, uuidv5.URL);
    return this.db.withLock(`question-draft:${id}`, async () => {
      const existing = await this.db.getQuestionById(id);
      if (existing) {
        if (existing.quiz_id !== dto.quiz_id) throw new ForbiddenException('Question belongs to another quiz');
        const { quiz_id, ...updates } = values;
        return this.update(id, teacherId, updates);
      }
      try { return await this.createStored(teacherId, values, id); }
      catch (error) {
        const committed = await this.db.getQuestionById(id);
        if (committed?.quiz_id === dto.quiz_id) {
          const { quiz_id, ...updates } = values;
          return this.update(id, teacherId, updates);
        }
        throw error;
      }
    });
  }

  private async createStored(teacherId: string, dto: CreateQuestionDto, id?: string): Promise<Question> {
    const quiz = await this.db.getQuizById(dto.quiz_id);
    if (!quiz) throw new NotFoundException("Quiz not found");
    if (quiz.teacher_id !== teacherId)
      throw new ForbiddenException("You do not own this quiz");

    this.validateQuestionData(dto.type, dto.options, dto.correct_answer);
    validateEssayCriteria(dto.rubric, dto.type, dto.points);

    const existingQuestions = await this.db.listQuestions(dto.quiz_id);
    const orderIndex =
      dto.order_index !== undefined
        ? dto.order_index
        : existingQuestions.length;

    // Auto-setup options for true_false if not passed
    let finalOptions = dto.options;
    if (
      dto.type === "true_false" &&
      (!finalOptions || finalOptions.length === 0)
    ) {
      finalOptions = [
        { id: "opt_true", text: "True" },
        { id: "opt_false", text: "False" },
      ];
    }

    return this.db.createQuestion({
      ...dto,
      ...(id ? { id } : {}),
      options: finalOptions,
      order_index: orderIndex,
    });
  }

  async importQuestions(
    teacherId: string,
    dto: ImportQuestionsDto,
  ): Promise<Question[]> {
    const operation = async () => {
      const quiz = await this.db.getQuizById(dto.quiz_id);
      if (!quiz) throw new NotFoundException("Quiz not found");
      if (quiz.teacher_id !== teacherId)
        throw new ForbiddenException("You do not own this quiz");
      // Validate the whole preview before any write; never trust client answer marks.
      for (const q of dto.questions) {
        if (!q.prompt.trim())
          throw new BadRequestException("Every question needs text");
        this.validateQuestionData(q.type || "mcq", q.options, q.correct_answer);
        if (q.type === "essay" && q.options.length)
          throw new BadRequestException("Essay questions cannot have choices");
        if (
          q.type === "true_false" &&
          (q.options.length !== 2 ||
            !q.options.some((o) => o.id === "opt_true" && o.text === "True") ||
            !q.options.some((o) => o.id === "opt_false" && o.text === "False"))
        )
          throw new BadRequestException(
            "True/False questions need True and False choices",
          );
      }
      const existing = await this.db.listQuestions(quiz.id);
      const firstOrder = existing.reduce(
        (max, q) => Math.max(max, q.order_index + 1),
        0,
      );
      const rows = dto.questions.map((q, index) => ({
        ...q,
        type: q.type || ("mcq" as const),
        correct_answer: q.type === "essay" ? null : q.correct_answer,
        quiz_id: quiz.id,
        id: uuidv5(
          `${teacherId}:${quiz.id}:${dto.import_id}:${index}`,
          uuidv5.URL,
        ),
        order_index: firstOrder + index,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
      const sameContent = (a: Question, b: (typeof rows)[number]) =>
        a &&
        a.type === b.type &&
        a.prompt === b.prompt &&
        Number(a.points) === b.points &&
        a.correct_answer === b.correct_answer &&
        a.options?.length === b.options.length &&
        a.options.every(
          (o, i) => o.id === b.options[i].id && o.text === b.options[i].text,
        );
      const prior = rows.map((q) =>
        existing.find((saved) => saved.id === q.id),
      );
      if (prior.some(Boolean)) {
        if (!prior.every((q, i) => q && sameContent(q, rows[i])))
          throw new ConflictException(
            "This import was already saved. Reopen Paste questions to start another.",
          );
        return prior as Question[];
      }
      const saved = await this.db.createQuestionBatch(rows);
      if (!saved.every((q, i) => sameContent(q, rows[i])))
        throw new ConflictException(
          "This import was already saved with different content.",
        );
      return saved;
    };
    return this.db.withLock(`question-import:${dto.quiz_id}`, operation);
  }

  async update(
    id: string,
    teacherId: string,
    dto: UpdateQuestionDto,
  ): Promise<Question> {
    const question = await this.db.getQuestionById(id);
    if (!question) throw new NotFoundException("Question not found");

    const quiz = await this.db.getQuizById(question.quiz_id);
    if (!quiz) throw new NotFoundException("Parent quiz not found");
    if (quiz.teacher_id !== teacherId)
      throw new ForbiddenException("You do not own this quiz");

    const effectiveType = dto.type || question.type;
    const effectiveOptions =
      dto.options !== undefined ? dto.options : question.options;
    const effectiveAnswer =
      dto.correct_answer !== undefined
        ? dto.correct_answer
        : question.correct_answer;

    this.validateQuestionData(effectiveType, effectiveOptions, effectiveAnswer);
    validateEssayCriteria(
      dto.rubric !== undefined ? dto.rubric : question.rubric,
      effectiveType,
      dto.points !== undefined ? dto.points : question.points,
    );

    return this.db.updateQuestion(id, dto);
  }

  async delete(id: string, teacherId: string): Promise<{ success: boolean }> {
    const question = await this.db.getQuestionById(id);
    if (!question) throw new NotFoundException("Question not found");

    const quiz = await this.db.getQuizById(question.quiz_id);
    if (!quiz) throw new NotFoundException("Parent quiz not found");
    if (quiz.teacher_id !== teacherId)
      throw new ForbiddenException("You do not own this quiz");

    await this.db.deleteQuestion(id);
    return { success: true };
  }
}
