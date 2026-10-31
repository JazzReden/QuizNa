import { v5 as uuidv5 } from "uuid";
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { Quiz, UserProfile } from '../../common/types';
import { CreateQuizDto, UpdateQuizDto } from './quizzes.dto';
import { hasPaperDraftChanges } from '../../common/paper-draft';

@Injectable()
export class QuizzesService {
  constructor(private db: DatabaseService) {}

  private validateAvailability(value: { available_from?: string; available_until?: string }) {
    if (value.available_from && value.available_until && Date.parse(value.available_from) >= Date.parse(value.available_until)) {
      throw new BadRequestException('The closing date must be after the opening date');
    }
  }

  private generateAccessCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  async listForTeacher(teacherId: string): Promise<Quiz[]> {
    const quizzes = await this.db.listQuizzes(teacherId);
    // Enrich with question count
    for (const quiz of quizzes) {
      const questions = await this.db.listQuestions(quiz.id);
      quiz.questions = questions;
      if (quiz.exam_format === 'paper') {
        const attempts = (await this.db.listAttemptsByQuiz(quiz.id)).filter(a => a.status !== 'in_progress');
        quiz.paper_submitted_count = attempts.length;
        quiz.paper_graded_count = attempts.filter(a => a.is_graded).length;
      }
    }
    return quizzes;
  }

  async getByIdForTeacher(id: string, teacherId: string): Promise<Quiz> {
    const quiz = await this.db.getQuizById(id);
    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }
    if (quiz.teacher_id !== teacherId) {
      throw new ForbiddenException('You do not own this quiz');
    }
    quiz.questions = await this.db.listQuestions(quiz.id);
    if (quiz.exam_format === 'paper') {
      const edition = await this.db.getQuizVersion(id, quiz.version);
      quiz.paper_has_unpublished_changes = hasPaperDraftChanges(quiz, quiz.questions, edition);
      quiz.paper_published_question_count = edition?.snapshot_data.questions.length || 0;
    }
    return quiz;
  }

  async getByAccessCodeForStudent(accessCode: string, studentId?: string): Promise<Partial<Quiz> & { question_count: number; section_name?: string }> {
    const {quiz,section} = await this.db.resolveQuizAccess(accessCode);
    if (!quiz) throw new NotFoundException('Quiz with this access code not found or not published');
    if (studentId) {
      const prior=(await this.db.listAttemptsByStudent(studentId)).filter(a=>a.quiz_id===quiz.id);
      if(prior.some(a=>(a.section_id||null)!==(section?.id||null)))throw new ConflictException('Use the code for your original section. Ask your teacher if it needs correcting.');
      const active=prior.find(a=>a.status==='in_progress');
      if (active) {
        if ((active.section_id || null) !== (section?.id || null)) throw new ConflictException('Use the code for your original section. Ask your teacher if it needs correcting.');
        const version = await this.db.getVersionForAttempt(active);
        return { section_name: section?.name, id: quiz.id, title: version.snapshot_data.title, instructions: version.snapshot_data.instructions, time_limit_minutes: version.snapshot_data.time_limit_minutes, question_count: version.snapshot_data.questions.length };
      }
    }
    if (quiz.status !== 'published') throw new NotFoundException('Quiz with this access code not found or not published');

    // Check availability windows
    const now = new Date();
    if (quiz.available_from && new Date(quiz.available_from) > now) {
      throw new BadRequestException(`Quiz is not available yet. It will open on ${quiz.available_from}`);
    }
    if (quiz.available_until && new Date(quiz.available_until) <= now) {
      throw new BadRequestException('Quiz is closed. The deadline has passed.');
    }

    const published = await this.db.getQuizVersion(quiz.id, quiz.version);
    if (!published) throw new BadRequestException('Quiz edition unavailable');
    const questions = published.snapshot_data.questions;

    if (quiz.exam_format === 'paper') throw new BadRequestException('This exam is taken on paper. Ask your teacher for your printed sheet.');
    // Return safe student-facing metadata
    return {
      id: quiz.id,
      title: published.snapshot_data.title,
      description: quiz.description,
      instructions: published.snapshot_data.instructions,
      access_code: accessCode.trim().toUpperCase(),
      section_name: section?.name,
      time_limit_minutes: published.snapshot_data.time_limit_minutes,
      max_attempts: quiz.max_attempts,
      randomize_questions: published.snapshot_data.randomize_questions,
      available_from: quiz.available_from,
      available_until: quiz.available_until,
      release_scores_immediately: quiz.release_scores_immediately,
      status: quiz.status,
      question_count: questions.length,
    };
  }

  async create(teacher: UserProfile, dto: CreateQuizDto): Promise<Quiz> {
    const { client_draft_id, ...values } = dto;
    if (!client_draft_id) return this.createStored(teacher, values);
    const id = uuidv5(`quiz-draft:${teacher.id}:${client_draft_id}`, uuidv5.URL);
    return this.db.withLock(`quiz-draft:${id}`, async () => {
      const prior = await this.db.getQuizById(id);
      if (prior) {
        if (prior.teacher_id !== teacher.id) throw new ForbiddenException('You do not own this quiz');
        if (prior.status !== 'draft') throw new ConflictException('This draft was already published. Open it from Quizzes.');
        return this.update(id, teacher.id, values);
      }
      try { return await this.createStored(teacher, values, id); }
      catch (error) {
        // A concurrent instance may have committed the same scoped draft ID.
        const committed = await this.db.getQuizById(id);
        if (committed?.teacher_id === teacher.id && committed.status === 'draft') return this.update(id, teacher.id, values);
        throw error;
      }
    });
  }

  private async createStored(teacher: UserProfile, dto: CreateQuizDto, id?: string): Promise<Quiz> {
    this.validateAvailability(dto);
    if (dto.access_code?.trim().toUpperCase().startsWith('S-')) throw new BadRequestException('This code format is reserved for sections');
    let accessCode = dto.access_code ? dto.access_code.trim().toUpperCase() : this.generateAccessCode();

    // Ensure access code is unique
    const existing = await this.db.getQuizByCode(accessCode);
    if (existing) {
      if (dto.access_code) {
        throw new ConflictException(`Access code "${accessCode}" is already in use.`);
      }
      accessCode = this.generateAccessCode();
    }

    const quiz = await this.db.createQuiz({
      ...(id ? { id } : {}),
      teacher_id: teacher.id,
      exam_format: dto.exam_format || 'online',
      require_access_code: dto.require_access_code ?? false,
      title: dto.title,
      subject: dto.subject,
      description: dto.description,
      instructions: dto.instructions,
      access_code: accessCode,
      time_limit_minutes: dto.time_limit_minutes || 30,
      max_attempts: dto.max_attempts || 1,
      randomize_questions: dto.randomize_questions || false,
      randomize_options: dto.randomize_options || false,
      available_from: dto.available_from,
      available_until: dto.available_until,
      release_scores_immediately: dto.release_scores_immediately || false,
      release_answers_immediately: dto.release_answers_immediately || false,
      status: 'draft',
    });

    return quiz;
  }

  async update(id: string, teacherId: string, dto: UpdateQuizDto): Promise<Quiz> {
    const quiz = await this.db.getQuizById(id);
    if (!quiz) throw new NotFoundException('Quiz not found');
    if (quiz.teacher_id !== teacherId) throw new ForbiddenException('You do not own this quiz');

    if (dto.exam_format && dto.exam_format !== (quiz.exam_format || 'online') && quiz.version > 1) throw new BadRequestException('The exam format is fixed after publication. Create a new exam to change formats.');
    this.validateAvailability({ ...quiz, ...dto });
    if (dto.access_code?.trim().toUpperCase().startsWith('S-')) throw new BadRequestException('This code format is reserved for sections');
    if (dto.status === 'published' && quiz.status !== 'published') throw new BadRequestException('Use Publish to create a quiz edition');
    if (dto.access_code && dto.access_code.toUpperCase() !== quiz.access_code) {
      const existing = await this.db.getQuizByCode(dto.access_code);
      if (existing && existing.id !== id) {
        throw new ConflictException(`Access code "${dto.access_code}" is already in use.`);
      }
      dto.access_code = dto.access_code.toUpperCase();
    }

    return this.db.updateQuiz(id, dto);
  }

  async publish(id: string, teacherId: string): Promise<Quiz> {
    if (this.db.isMysql && !this.db.hasLocalTransaction) return this.db.withLock('local-business-operation', () => this.publish(id, teacherId));
    if (this.db.isLive) return this.db.command<Quiz>('publish', teacherId, { quiz_id: id });
    const quiz = await this.db.getQuizById(id);
    if (!quiz) throw new NotFoundException('Quiz not found');
    if (quiz.teacher_id !== teacherId) throw new ForbiddenException('You do not own this quiz');

    const questions = await this.db.listQuestions(id);
    if (questions.length === 0) {
      throw new BadRequestException('Cannot publish a quiz with no questions. Please add at least one question.');
    }

    const nextVersion = quiz.version + 1;

    // Freeze snapshot into quiz_versions table
    await this.db.createQuizVersion(quiz.id, nextVersion, {
      exam_format: quiz.exam_format || 'online',
      title: quiz.title,
      instructions: quiz.instructions,
      time_limit_minutes: quiz.time_limit_minutes,
      max_attempts: quiz.max_attempts,
      randomize_questions: quiz.randomize_questions,
      randomize_options: quiz.randomize_options,
      questions: JSON.parse(JSON.stringify(questions)),
    });

    return this.db.updateQuiz(id, {
      status: 'published',
      version: nextVersion,
    });
  }

  async delete(id: string, teacherId: string): Promise<{ success: boolean }> {
    const quiz = await this.db.getQuizById(id);
    if (!quiz) throw new NotFoundException('Quiz not found');
    if (quiz.teacher_id !== teacherId) throw new ForbiddenException('You do not own this quiz');

    await this.db.deleteQuiz(id);
    return { success: true };
  }
}
