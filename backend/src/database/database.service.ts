import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import {
  AttemptAnswer,
  ClassSection,
  IncidentType,
  Question,
  Quiz,
  QuizAttempt,
  QuizIncident,
  QuizSection,
  QuizVersion,
  RosterStudent,
  UserProfile,
} from "../common/types";
import { LocalAuthService } from "../modules/auth/local-auth.service";
import { PaperSheet } from "../modules/paper/paper.types";
import {
  SubjectMember,
  SubjectQuiz,
  SubjectRoom,
} from "../modules/subjects/subjects.types";
import { LocalCollection, MysqlLocalStore } from "./mysql-local.store";

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private mysql: MysqlLocalStore | null = null;
  private mysqlAuth: LocalAuthService | null = null;
  private readonly logger = new Logger(DatabaseService.name);
  private supabase: SupabaseClient | null = null;
  private subjects = new Map<string, SubjectRoom>();
  private subjectMembers = new Map<string, SubjectMember>();
  private subjectQuizzes = new Map<string, SubjectQuiz>();
  private paperSheets = new Map<string, PaperSheet>();
  private profiles = new Map<string, UserProfile>();
  private quizzes = new Map<string, Quiz>();
  private classes = new Map<string, ClassSection>();
  private roster = new Map<string, RosterStudent>();
  private sections = new Map<string, QuizSection>();
  private questions = new Map<string, Question>();
  private quizVersions = new Map<string, QuizVersion>();
  private attempts = new Map<string, QuizAttempt>();
  private answers = new Map<string, AttemptAnswer>();
  private incidents = new Map<string, QuizIncident>();
  private locks = new Map<string, Promise<void>>();

  constructor(configService: ConfigService) {
    const url = configService.get<string>("SUPABASE_URL");
    const key = configService.get<string>("SUPABASE_SERVICE_ROLE_KEY");
    const demo =
      configService.get<string>("DEMO_MODE") === "true" ||
      configService.get<string>("NODE_ENV") === "test";
    if (demo && configService.get<string>("NODE_ENV") === "production") {
      throw new Error("DEMO_MODE must be disabled in production");
    }
    const mysql =
      configService.get<string>("DATABASE_MODE") === "mysql" &&
      process.env.NODE_ENV !== "test";
    if (
      mysql &&
      (!demo || configService.get<string>("NODE_ENV") === "production")
    ) {
      throw new Error(
        "XAMPP storage is local demo only. Enable DEMO_MODE=true with NODE_ENV=development.",
      );
    }
    if (mysql) {
      this.mysql = new MysqlLocalStore(configService);
      this.mysqlAuth = new LocalAuthService(this.mysql);
    }
    if (demo) {
      this.seedDemoData();
      this.logger.warn(
        this.mysql
          ? "LOCAL MYSQL: persistent XAMPP data with password-based local accounts."
          : "DEMO MODE: ephemeral local data and fixed demo identities. Never use with real student data.",
      );
    } else {
      if (!url || !key || url.includes("your-project")) {
        throw new Error(
          "Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or explicitly enable DEMO_MODE locally",
        );
      }
      this.supabase = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
  }
  async onModuleInit() {
    if (!this.mysql) return;
    await this.mysql.initialize(async () => {
      for (const collection of [
        "profiles",
        "quizzes",
        "questions",
        "quizVersions",
        "attempts",
        "answers",
        "incidents",
      ] as LocalCollection[]) {
        for (const row of this[collection].values())
          await this.mysql!.put(collection, row);
      }
    });
    for (const collection of [
      "profiles",
      "quizzes",
      "questions",
      "quizVersions",
      "attempts",
      "answers",
      "incidents",
    ] as LocalCollection[])
      this[collection].clear();
    this.logger.log("Connected to persistent local XAMPP/MariaDB storage.");
  }
  async onModuleDestroy() {
    await this.mysql?.close();
  }
  get localAuth(): LocalAuthService {
    if (!this.mysqlAuth)
      throw new ServiceUnavailableException("Local accounts are unavailable");
    return this.mysqlAuth;
  }
  get isMysql(): boolean {
    return this.mysql !== null;
  }
  get hasLocalTransaction(): boolean {
    return this.mysql?.inTransaction || false;
  }
  get databaseMode(): string {
    return this.isLive
      ? "Supabase PostgreSQL (Live)"
      : this.isMysql
        ? "XAMPP MariaDB (Persistent Local Demo)"
        : "In-Memory Seed Engine (Development)";
  }
  private async localGet<T>(
    collection: LocalCollection,
    key: string,
  ): Promise<T | null> {
    return this.mysql
      ? this.mysql.get<T>(collection, key)
      : (structuredClone(this[collection].get(key) || null) as T | null);
  }
  private async localAll<T>(collection: LocalCollection): Promise<T[]> {
    return this.mysql
      ? this.mysql.all<T>(collection)
      : (structuredClone([...this[collection].values()]) as T[]);
  }
  private async localPut<T extends object>(
    collection: LocalCollection,
    key: string,
    row: T,
  ): Promise<void> {
    if (this.mysql) await this.mysql.put(collection, row);
    else (this[collection] as Map<string, T>).set(key, structuredClone(row));
  }
  private async localRemove(
    collection: LocalCollection,
    key: string,
  ): Promise<boolean> {
    return this.mysql
      ? this.mysql.remove(collection, key)
      : this[collection].delete(key);
  }
  get isLive(): boolean {
    return this.supabase !== null;
  }
  get client(): SupabaseClient | null {
    return this.supabase;
  }
  get isDemo(): boolean {
    return !this.isLive;
  }

  // Serializes demo operations; PostgreSQL RPCs hold row/advisory locks in live mode.
  async withLock<T>(key: string, work: () => Promise<T>): Promise<T> {
    if (this.mysql) return this.mysql.transaction(work);
    const previous = this.locks.get(key) || Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => gate);
    this.locks.set(key, tail);
    await previous;
    try {
      return await work();
    } finally {
      release();
      if (this.locks.get(key) === tail) this.locks.delete(key);
    }
  }

  private async query<T>(
    request: PromiseLike<{ data: any; error: any }>,
  ): Promise<T> {
    const { data, error } = await request;
    if (error) {
      this.logger.error(
        `Database operation failed (${error.code || "unknown"})`,
      );
      throw new ServiceUnavailableException(
        "Unable to store or retrieve data. Please retry.",
      );
    }
    return data as T;
  }

  async command<T>(
    action: string,
    actor: string | null,
    payload: Record<string, unknown>,
  ): Promise<T> {
    const { data, error } = await this.supabase!.rpc("quizna_attempt_command", {
      p_action: action,
      p_actor: actor,
      p_payload: payload,
    });
    if (error) {
      const messages: Record<string, () => Error> = {
        QN404: () => new NotFoundException("Quiz or attempt not found"),
        QN403: () => new ForbiddenException("Access denied"),
        QN409: () =>
          new ConflictException(
            action === "confirm_score"
              ? "This result changed. Refresh and review before confirming."
              : action === "grade"
                ? "This answer changed. Review its current grade."
                : "Attempt limit reached",
          ),
        QN400: () =>
          new BadRequestException(
            "Attempt is closed, expired, or the quiz is unavailable",
          ),
      };
      if (messages[error.code]) throw messages[error.code]();
      this.logger.error(`Attempt transaction failed (${error.code})`);
      throw new ServiceUnavailableException(
        "Unable to complete request. Please retry.",
      );
    }
    return data as T;
  }

  async copyQuizLive(source: string, teacher: string, target: string, id: string): Promise<Quiz> {
    const result = await this.supabase!.rpc('quizna_copy_quiz', {
      p_source: source, p_teacher: teacher, p_target: target, p_id: id,
    });
    if (result.error?.code === '42501') throw new ForbiddenException('Choose one of your own quizzes and subjects.');
    if (result.error?.code === 'P0001' && result.error.message === 'Choose another section')
      throw new BadRequestException('Choose a different section.');
    return this.query(Promise.resolve(result));
  }

  private seedDemoData() {
    // 1. Seed Teacher and Students
    const teacherId = "a0000000-0000-0000-0000-000000000001";
    const student1Id = "b0000000-0000-0000-0000-000000000002";
    const student2Id = "b0000000-0000-0000-0000-000000000003";

    this.profiles.set(teacherId, {
      id: teacherId,
      email: "teacher@quizna.dev",
      full_name: "Prof. Sarah Connor",
      role: "teacher",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    this.profiles.set(student1Id, {
      id: student1Id,
      email: "student@quizna.dev",
      full_name: "Alex Mercer",
      role: "student",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    this.profiles.set(student2Id, {
      id: student2Id,
      email: "student2@quizna.dev",
      full_name: "Emma Watson",
      role: "student",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // 2. Seed Demo Quiz
    const quizId = "c0000000-0000-0000-0000-000000000001";
    this.quizzes.set(quizId, {
      id: quizId,
      teacher_id: teacherId,
      title: "CS 101: Data Structures & Algorithms Assessment",
      description:
        "Midterm evaluation covering algorithmic complexity, trees, and operating systems memory concepts.",
      instructions:
        "Please read all questions carefully. You must remain in fullscreen mode throughout the test. Tab switching and exiting fullscreen are logged as possible violations.",
      access_code: "CS101",
      time_limit_minutes: 20,
      max_attempts: 1,
      randomize_questions: false,
      randomize_options: false,
      release_scores_immediately: false,
      release_answers_immediately: false,
      status: "published",
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // 3. Seed Demo Questions
    const q1: Question = {
      id: "d0000000-0000-0000-0000-000000000001",
      quiz_id: quizId,
      type: "mcq",
      prompt:
        "What is the worst-case time complexity of standard QuickSort without randomized pivot selection?",
      explanation:
        "When the selected pivot is repeatedly the smallest or largest element, recursion degenerates to depth n.",
      points: 2.0,
      order_index: 0,
      options: [
        { id: "opt_1", text: "O(n log n)", is_correct: false },
        { id: "opt_2", text: "O(n²)", is_correct: true },
        { id: "opt_3", text: "O(n)", is_correct: false },
        { id: "opt_4", text: "O(log n)", is_correct: false },
      ],
      correct_answer: "opt_2",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const q2: Question = {
      id: "d0000000-0000-0000-0000-000000000002",
      quiz_id: quizId,
      type: "true_false",
      prompt:
        "A standard Binary Search Tree (BST) always guarantees O(log n) lookup time regardless of insertion order.",
      explanation:
        "False: inserting sorted keys causes a standard BST to degenerate into a linked list with O(n) lookup time.",
      points: 2.0,
      order_index: 1,
      options: [
        { id: "opt_true", text: "True", is_correct: false },
        { id: "opt_false", text: "False", is_correct: true },
      ],
      correct_answer: "opt_false",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const q3: Question = {
      id: "d0000000-0000-0000-0000-000000000003",
      quiz_id: quizId,
      type: "short_answer",
      prompt:
        "Which fundamental abstract data structure adheres to the First-In, First-Out (FIFO) access policy?",
      explanation:
        "A Queue removes elements in the exact order they were enqueued (FIFO).",
      points: 3.0,
      order_index: 2,
      correct_answer: ["queue", "Queue", "FIFO Queue"],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const q4: Question = {
      id: "d0000000-0000-0000-0000-000000000004",
      quiz_id: quizId,
      type: "essay",
      prompt:
        "Explain the primary differences between a Process and a Thread in operating systems. Specifically address memory address space sharing, creation cost, and context switching overhead.",
      points: 5.0,
      order_index: 3,
      rubric:
        "Rubric (Total 5 pts): Memory Isolation & Sharing (2 pts), Creation/Destruction overhead (1.5 pts), Context switching cost & register/TLB state (1.5 pts).",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    [q1, q2, q3, q4].forEach((q) => this.questions.set(q.id, q));

    // 4. Initial Frozen Quiz Version
    this.quizVersions.set(`${quizId}_1`, {
      id: "e0000000-0000-0000-0000-000000000001",
      quiz_id: quizId,
      version_number: 1,
      snapshot_data: {
        title: this.quizzes.get(quizId)!.title,
        instructions: this.quizzes.get(quizId)!.instructions,
        time_limit_minutes: 20,
        max_attempts: 1,
        randomize_questions: false,
        randomize_options: false,
        questions: structuredClone([q1, q2, q3, q4]),
      },
      created_at: new Date().toISOString(),
    });
  }

  async getProfile(id: string): Promise<UserProfile | null> {
    if (this.mysql && !this.mysql.inTransaction)
      return this.mysql.transaction(() => this.getProfile(id));
    return this.isLive
      ? this.query(
          this.supabase!.from("profiles")
            .select("*")
            .eq("id", id)
            .maybeSingle(),
        )
      : structuredClone(
          (await this.localGet<UserProfile>("profiles", id)) || null,
        );
  }
  async getProfileByEmail(email: string): Promise<UserProfile | null> {
    if (this.mysql && !this.mysql.inTransaction)
      return this.mysql.transaction(() => this.getProfileByEmail(email));
    return this.isLive
      ? this.query(
          this.supabase!.from("profiles")
            .select("*")
            .eq("email", email)
            .maybeSingle(),
        )
      : structuredClone(
          (await this.localAll<UserProfile>("profiles")).find(
            (p) => p.email.toLowerCase() === email.toLowerCase(),
          ) || null,
        );
  }
  async createProfile(
    input: Partial<UserProfile> &
      Pick<UserProfile, "id" | "email" | "full_name" | "role">,
  ): Promise<UserProfile> {
    if (this.mysql && !this.mysql.inTransaction)
      return this.mysql.transaction(() => this.createProfile(input));
    const row = {
      ...input,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as UserProfile;
    if (this.isLive)
      return this.query(
        this.supabase!.from("profiles").insert(row).select().single(),
      );
    await this.localPut("profiles", row.id, row);
    return row;
  }
  async getPaperSheet(id: string): Promise<PaperSheet | null> {
    if (this.mysql && !this.mysql.inTransaction)
      return this.mysql.transaction(() => this.getPaperSheet(id));
    return this.isLive
      ? this.query(
          this.supabase!.from("paper_sheets")
            .select("*")
            .eq("id", id)
            .maybeSingle(),
        )
      : this.localGet<PaperSheet>("paperSheets", id);
  }
  async listPaperSheets(quizId: string): Promise<PaperSheet[]> {
    if (this.mysql && !this.mysql.inTransaction)
      return this.mysql.transaction(() => this.listPaperSheets(quizId));
    return this.isLive
      ? this.query(
          this.supabase!.from("paper_sheets")
            .select("*")
            .eq("quiz_id", quizId)
            .order("created_at", { ascending: false }),
        )
      : (await this.localAll<PaperSheet>("paperSheets")).filter(
          (s) => s.quiz_id === quizId,
        );
  }
  async putPaperSheet(row: PaperSheet) {
    await this.localPut("paperSheets", row.id, row);
  }
  async paperCommand<T>(
    action: string,
    actor: string,
    payload: unknown,
  ): Promise<T> {
    const { data, error } = await this.supabase!.rpc("quizna_paper_command", {
      p_action: action,
      p_actor: actor,
      p_payload: payload,
    });
    if (error) {
      if (error.code === "QN403")
        throw new ForbiddenException("You do not own this paper exam");
      if (error.code === "QN409")
        throw new ConflictException("The attempt limit has been reached");
      if (error.code === "QN400")
        throw new BadRequestException("Check the paper exam and answers");
      throw new ServiceUnavailableException(
        "Unable to save the paper exam. Please retry.",
      );
    }
    return data as T;
  }
  async listQuizzes(teacherId?: string): Promise<Quiz[]> {
    if (this.mysql && !this.mysql.inTransaction)
      return this.mysql.transaction(() => this.listQuizzes(teacherId));
    if (this.isLive) {
      let q = this.supabase!.from("quizzes").select("*");
      if (teacherId) q = q.eq("teacher_id", teacherId);
      return this.query(q.order("created_at", { ascending: false }));
    }
    return structuredClone(
      (await this.localAll<Quiz>("quizzes")).filter(
        (q) => !teacherId || q.teacher_id === teacherId,
      ),
    );
  }
  async getQuizById(id: string): Promise<Quiz | null> {
    if (this.mysql && !this.mysql.inTransaction)
      return this.mysql.transaction(() => this.getQuizById(id));
    return this.isLive
      ? this.query(
          this.supabase!.from("quizzes").select("*").eq("id", id).maybeSingle(),
        )
      : structuredClone((await this.localGet<Quiz>("quizzes", id)) || null);
  }
  async getQuizByCode(code: string): Promise<Quiz | null> {
    if (this.mysql && !this.mysql.inTransaction)
      return this.mysql.transaction(() => this.getQuizByCode(code));
    const normalized = code.trim().toUpperCase();
    return this.isLive
      ? this.query(
          this.supabase!.from("quizzes")
            .select("*")
            .eq("access_code", normalized)
            .maybeSingle(),
        )
      : structuredClone(
          (await this.localAll<Quiz>("quizzes")).find(
            (q) => q.access_code === normalized,
          ) || null,
        );
  }
  async subjectRecords<T>(
    collection: "subjects" | "subjectMembers" | "subjectQuizzes",
    filters: Record<string, string>,
  ): Promise<T[]> {
    if (this.mysql && !this.mysql.inTransaction)
      return this.mysql.transaction(() =>
        this.subjectRecords(collection, filters),
      );
    const tables = {
      subjects: "subject_rooms",
      subjectMembers: "subject_members",
      subjectQuizzes: "subject_quizzes",
    };
    if (this.isLive) {
      let query = this.supabase!.from(tables[collection]).select("*");
      for (const [key, value] of Object.entries(filters))
        query = query.eq(key, value);
      return this.query(query);
    }
    if (this.mysql) return this.mysql.find<T>(collection, filters);
    return (await this.localAll<any>(collection)).filter((row) =>
      Object.entries(filters).every(([k, v]) => row[k] === v),
    );
  }
  async saveSubjectRecord<T extends { id: string }>(
    collection: "subjects" | "subjectMembers" | "subjectQuizzes",
    row: T,
  ): Promise<T> {
    if (this.mysql && !this.mysql.inTransaction)
      return this.mysql.transaction(() =>
        this.saveSubjectRecord(collection, row),
      );
    const tables = {
      subjects: "subject_rooms",
      subjectMembers: "subject_members",
      subjectQuizzes: "subject_quizzes",
    };
    if (this.isLive)
      return this.query(
        this.supabase!.from(tables[collection])
          .upsert(row, { onConflict: "id" })
          .select()
          .single(),
      );
    await this.localPut(collection, row.id, row);
    return row;
  }
  async joinSubjectLive(id: string, studentId: string): Promise<void> {
    await this.query(
      this.supabase!.rpc("quizna_join_subject", {
        p_subject: id,
        p_student: studentId,
      }),
    );
  }
  async listClasses(teacherId: string): Promise<ClassSection[]> {
    if (this.mysql && !this.mysql.inTransaction)
      return this.mysql.transaction(() => this.listClasses(teacherId));
    return this.isLive
      ? this.query(
          this.supabase!.from("class_sections")
            .select("*")
            .eq("teacher_id", teacherId)
            .order("name"),
        )
      : this.mysql
        ? this.mysql.find<ClassSection>("classes", { teacher_id: teacherId })
        : (await this.localAll<ClassSection>("classes")).filter(
            (c) => c.teacher_id === teacherId,
          );
  }
  async getClass(id: string): Promise<ClassSection | null> {
    if (this.mysql && !this.mysql.inTransaction)
      return this.mysql.transaction(() => this.getClass(id));
    return this.isLive
      ? this.query(
          this.supabase!.from("class_sections")
            .select("*")
            .eq("id", id)
            .maybeSingle(),
        )
      : this.localGet<ClassSection>("classes", id);
  }
  async createClass(row: ClassSection): Promise<ClassSection> {
    if (this.mysql && !this.mysql.inTransaction)
      return this.mysql.transaction(() => this.createClass(row));
    if (this.isLive) {
      const result = await this.supabase!.from("class_sections")
        .insert(row)
        .select()
        .single();
      if (result.error?.code === "23505")
        throw new ConflictException("A section with this name already exists");
      return this.query(Promise.resolve(result));
    }
    await this.localPut("classes", row.id, row);
    return row;
  }
  async listRoster(classId: string): Promise<RosterStudent[]> {
    if (this.mysql && !this.mysql.inTransaction)
      return this.mysql.transaction(() => this.listRoster(classId));
    return this.isLive
      ? this.query(
          this.supabase!.from("section_students")
            .select("*")
            .eq("class_section_id", classId),
        )
      : this.mysql
        ? this.mysql.find<RosterStudent>("roster", {
            class_section_id: classId,
          })
        : (await this.localAll<RosterStudent>("roster")).filter(
            (r) => r.class_section_id === classId,
          );
  }
  /** Only successful section-code starts enroll students; never overwrite a teacher's roster name. */
  async enrollStartedStudent(
    section: QuizSection | null | undefined,
    student: UserProfile,
  ): Promise<void> {
    if (!section?.class_section_id) return;
    await this.withLock(`roster:${section.class_section_id}`, async () => {
      const owner = await this.getClass(section.class_section_id!);
      const quiz = await this.getQuizById(section.quiz_id);
      if (
        !owner ||
        !quiz ||
        owner.teacher_id !== quiz.teacher_id ||
        student.role !== "student"
      )
        throw new ForbiddenException("Section enrollment is unavailable");
      const email = student.email.trim().toLowerCase();
      if (
        (await this.listRoster(owner.id)).some(
          (s) => s.email.trim().toLowerCase() === email,
        )
      )
        return;
      await this.saveRosterStudent({
        id: randomUUID(),
        class_section_id: owner.id,
        full_name: student.full_name.trim().slice(0, 160),
        email,
        created_at: new Date().toISOString(),
      });
    });
  }
  async saveRosterStudent(row: RosterStudent): Promise<void> {
    await this.localPut("roster", row.id, row);
  }
  async removeRosterStudent(id: string): Promise<void> {
    await this.localRemove("roster", id);
  }
  async classCommand<T>(
    action: string,
    actor: string,
    payload: Record<string, unknown>,
  ): Promise<T> {
    const { data, error } = await this.supabase!.rpc("quizna_class_command", {
      p_action: action,
      p_actor: actor,
      p_payload: payload,
    });
    if (error) {
      if (error.code === "QN403")
        throw new ForbiddenException("You do not own this section or quiz");
      if (error.code === "QN404")
        throw new NotFoundException("Section or quiz not found");
      if (error.code === "23505")
        throw new ConflictException(
          "A section with this name is already attached",
        );
      if (error.code === "QN400")
        throw new BadRequestException("Check the section and student details");
      throw new ServiceUnavailableException(
        "Unable to update this section. Please retry.",
      );
    }
    return data as T;
  }
  async listSections(quizId: string): Promise<QuizSection[]> {
    if (this.mysql && !this.mysql.inTransaction)
      return this.mysql.transaction(() => this.listSections(quizId));
    return this.isLive
      ? this.query(
          this.supabase!.from("quiz_sections")
            .select("*")
            .eq("quiz_id", quizId)
            .order("name"),
        )
      : (await this.localAll<QuizSection>("sections"))
          .filter((s) => s.quiz_id === quizId)
          .sort((a, b) => a.name.localeCompare(b.name));
  }
  async getSection(id: string): Promise<QuizSection | null> {
    if (this.mysql && !this.mysql.inTransaction)
      return this.mysql.transaction(() => this.getSection(id));
    return this.isLive
      ? this.query(
          this.supabase!.from("quiz_sections")
            .select("*")
            .eq("id", id)
            .maybeSingle(),
        )
      : this.localGet<QuizSection>("sections", id);
  }
  async getSectionByCode(code: string): Promise<QuizSection | null> {
    if (this.mysql && !this.mysql.inTransaction)
      return this.mysql.transaction(() => this.getSectionByCode(code));
    const normalized = code.trim().toUpperCase();
    return this.isLive
      ? this.query(
          this.supabase!.from("quiz_sections")
            .select("*")
            .eq("access_code", normalized)
            .maybeSingle(),
        )
      : (await this.localAll<QuizSection>("sections")).find(
          (s) => s.access_code === normalized,
        ) || null;
  }
  async createSection(row: QuizSection): Promise<QuizSection> {
    if (this.mysql && !this.mysql.inTransaction)
      return this.mysql.transaction(() => this.createSection(row));
    if (this.isLive) {
      const result = await this.supabase!.from("quiz_sections")
        .insert(row)
        .select()
        .single();
      if (result.error?.code === "23505")
        throw new ConflictException("A section with this name already exists");
      return this.query(Promise.resolve(result));
    }
    if (
      (await this.listSections(row.quiz_id)).some(
        (s) => s.name.toLowerCase() === row.name.toLowerCase(),
      )
    )
      throw new ConflictException("A section with this name already exists");
    await this.localPut("sections", row.id, row);
    return row;
  }
  async resolveQuizAccess(
    code: string,
  ): Promise<{ quiz: Quiz | null; section: QuizSection | null }> {
    const quiz = await this.getQuizByCode(code);
    if (quiz) return { quiz, section: null };
    const section = await this.getSectionByCode(code);
    return {
      quiz: section ? await this.getQuizById(section.quiz_id) : null,
      section,
    };
  }
  async createQuiz(
    input: Partial<Quiz> & Pick<Quiz, "teacher_id" | "title" | "access_code">,
  ): Promise<Quiz> {
    if (this.mysql && !this.mysql.inTransaction)
      return this.mysql.transaction(() => this.createQuiz(input));
    const row: Quiz = {
      description: "",
      instructions: "",
      time_limit_minutes: 30,
      max_attempts: 1,
      randomize_questions: false,
      randomize_options: false,
      release_scores_immediately: false,
      release_answers_immediately: false,
      require_access_code: false,
      status: "draft",
      version: 1,
      ...input,
      id: input.id || randomUUID(),
      access_code: input.access_code.toUpperCase(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (this.isLive)
      return this.query(
        this.supabase!.from("quizzes").insert(row).select().single(),
      );
    await this.localPut("quizzes", row.id, row);
    return row;
  }
  async updateQuiz(id: string, updates: Partial<Quiz>): Promise<Quiz> {
    if (this.mysql && !this.mysql.inTransaction)
      return this.mysql.transaction(() => this.updateQuiz(id, updates));
    // Never persist hydrated questions or other response-only properties.
    const { questions, ...values } = updates;
    if (this.isLive)
      return this.query(
        this.supabase!.from("quizzes")
          .update(values)
          .eq("id", id)
          .select()
          .single(),
      );
    const row = {
      ...(await this.localGet<Quiz>("quizzes", id))!,
      ...values,
      updated_at: new Date().toISOString(),
    };
    await this.localPut("quizzes", id, row);
    return row;
  }
  async deleteQuiz(id: string): Promise<boolean> {
    if (this.mysql && !this.mysql.inTransaction)
      return this.mysql.transaction(() => this.deleteQuiz(id));
    if (this.isLive) {
      await this.query(this.supabase!.from("quizzes").delete().eq("id", id));
      return true;
    }
    return this.localRemove("quizzes", id);
  }

  async discardQuizCopy(id: string): Promise<void> {
    if (this.isLive || this.isMysql) throw new Error('Copy cleanup is memory-only');
    for (const collection of ['questions', 'sections', 'subjectQuizzes'] as const) {
      for (const row of await this.localAll<{id: string; quiz_id: string}>(collection))
        if (row.quiz_id === id) await this.localRemove(collection, row.id);
    }
    await this.localRemove('quizzes', id);
  }
  async createQuizVersion(
    quizId: string,
    versionNumber: number,
    snapshotData: QuizVersion["snapshot_data"],
  ): Promise<QuizVersion> {
    if (this.mysql && !this.mysql.inTransaction)
      return this.mysql.transaction(() =>
        this.createQuizVersion(quizId, versionNumber, snapshotData),
      );
    const row = {
      id: randomUUID(),
      quiz_id: quizId,
      version_number: versionNumber,
      snapshot_data: structuredClone(snapshotData),
      created_at: new Date().toISOString(),
    };
    if (this.isLive)
      return this.query(
        this.supabase!.from("quiz_versions").insert(row).select().single(),
      );
    await this.localPut("quizVersions", `${quizId}_${versionNumber}`, row);
    return structuredClone(row);
  }
  async getQuizVersion(
    quizId: string,
    version: number,
  ): Promise<QuizVersion | null> {
    if (this.mysql && !this.mysql.inTransaction)
      return this.mysql.transaction(() => this.getQuizVersion(quizId, version));
    return this.isLive
      ? this.query(
          this.supabase!.from("quiz_versions")
            .select("*")
            .eq("quiz_id", quizId)
            .eq("version_number", version)
            .maybeSingle(),
        )
      : structuredClone(
          (await this.localGet<QuizVersion>(
            "quizVersions",
            `${quizId}_${version}`,
          )) || null,
        );
  }
  async getVersionForAttempt(attempt: QuizAttempt): Promise<QuizVersion> {
    if (this.mysql && !this.mysql.inTransaction)
      return this.mysql.transaction(() => this.getVersionForAttempt(attempt));
    let version: QuizVersion | null;
    if (this.isLive)
      version = await this.query(
        this.supabase!.from("quiz_versions")
          .select("*")
          .eq("id", attempt.quiz_version_id)
          .maybeSingle(),
      );
    else
      version = structuredClone(
        (await this.localAll<QuizVersion>("quizVersions")).find(
          (v) => v.id === attempt.quiz_version_id,
        ) ||
          (await this.localGet<QuizVersion>(
            "quizVersions",
            `${attempt.quiz_id}_1`,
          )) ||
          null,
      );
    if (!version || version.quiz_id !== attempt.quiz_id)
      throw new ServiceUnavailableException(
        "Published quiz version unavailable",
      );
    return version;
  }
  async getAttemptQuestions(attempt: QuizAttempt): Promise<Question[]> {
    if (this.mysql && !this.mysql.inTransaction)
      return this.mysql.transaction(() => this.getAttemptQuestions(attempt));
    const version = await this.getVersionForAttempt(attempt);
    const lookup = new Map(
      version.snapshot_data.questions.map((q) => [q.id, q]),
    );
    return attempt.question_order
      .map((id) => lookup.get(id))
      .filter((q): q is Question => !!q);
  }
  async listQuestions(quizId: string): Promise<Question[]> {
    if (this.mysql && !this.mysql.inTransaction)
      return this.mysql.transaction(() => this.listQuestions(quizId));
    return this.isLive
      ? this.query(
          this.supabase!.from("questions")
            .select("*")
            .eq("quiz_id", quizId)
            .order("order_index"),
        )
      : structuredClone(
          (await this.localAll<Question>("questions"))
            .filter((q) => q.quiz_id === quizId)
            .sort((a, b) => a.order_index - b.order_index),
        );
  }
  async getQuestionById(id: string): Promise<Question | null> {
    if (this.mysql && !this.mysql.inTransaction)
      return this.mysql.transaction(() => this.getQuestionById(id));
    return this.isLive
      ? this.query(
          this.supabase!.from("questions")
            .select("*")
            .eq("id", id)
            .maybeSingle(),
        )
      : structuredClone(
          (await this.localGet<Question>("questions", id)) || null,
        );
  }
  async createQuestion(
    input: Partial<Question> & Pick<Question, "quiz_id" | "prompt" | "type">,
  ): Promise<Question> {
    if (this.mysql && !this.mysql.inTransaction)
      return this.mysql.transaction(() => this.createQuestion(input));
    const row = {
      points: 1,
      order_index: 0,
      ...input,
      id: input.id || randomUUID(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as Question;
    if (this.isLive)
      return this.query(
        this.supabase!.from("questions").insert(row).select().single(),
      );
    await this.localPut("questions", row.id, row);
    return row;
  }
  /** One insert statement in PostgreSQL; one transaction in local MariaDB. */
  async createQuestionBatch(rows: Question[]): Promise<Question[]> {
    if (this.mysql && !this.mysql.inTransaction)
      return this.mysql.transaction(() => this.createQuestionBatch(rows));
    if (this.isLive) {
      await this.query(
        this.supabase!.from("questions").upsert(rows, {
          onConflict: "id",
          ignoreDuplicates: true,
        }),
      );
      const saved = await this.query<Question[]>(
        this.supabase!.from("questions")
          .select("*")
          .in(
            "id",
            rows.map((q) => q.id),
          ),
      );
      const byId = new Map(saved.map((q) => [q.id, q]));
      return rows.map((q) => byId.get(q.id)!);
    }
    for (const row of rows) await this.localPut("questions", row.id, row);
    return structuredClone(rows);
  }
  async updateQuestion(
    id: string,
    updates: Partial<Question>,
  ): Promise<Question> {
    if (this.mysql && !this.mysql.inTransaction)
      return this.mysql.transaction(() => this.updateQuestion(id, updates));
    if (this.isLive)
      return this.query(
        this.supabase!.from("questions")
          .update(updates)
          .eq("id", id)
          .select()
          .single(),
      );
    const row = {
      ...(await this.localGet<Question>("questions", id))!,
      ...updates,
      updated_at: new Date().toISOString(),
    };
    await this.localPut("questions", id, row);
    return row;
  }
  async deleteQuestion(id: string): Promise<boolean> {
    if (this.mysql && !this.mysql.inTransaction)
      return this.mysql.transaction(() => this.deleteQuestion(id));
    if (this.isLive) {
      await this.query(this.supabase!.from("questions").delete().eq("id", id));
      return true;
    }
    return this.localRemove("questions", id);
  }
  async getAttemptById(id: string): Promise<QuizAttempt | null> {
    if (this.mysql && !this.mysql.inTransaction)
      return this.mysql.transaction(() => this.getAttemptById(id));
    return this.isLive
      ? this.query(
          this.supabase!.from("quiz_attempts")
            .select("*")
            .eq("id", id)
            .maybeSingle(),
        )
      : structuredClone(
          (await this.localGet<QuizAttempt>("attempts", id)) || null,
        );
  }
  async listAttemptsByQuiz(id: string): Promise<QuizAttempt[]> {
    if (this.mysql && !this.mysql.inTransaction)
      return this.mysql.transaction(() => this.listAttemptsByQuiz(id));
    return this.isLive
      ? this.query(
          this.supabase!.from("quiz_attempts")
            .select("*")
            .eq("quiz_id", id)
            .order("started_at", { ascending: false }),
        )
      : structuredClone(
          (await this.localAll<QuizAttempt>("attempts")).filter(
            (a) => a.quiz_id === id,
          ),
        );
  }
  async listAttemptsByStudent(id: string): Promise<QuizAttempt[]> {
    if (this.mysql && !this.mysql.inTransaction)
      return this.mysql.transaction(() => this.listAttemptsByStudent(id));
    return this.isLive
      ? this.query(
          this.supabase!.from("quiz_attempts")
            .select("*")
            .eq("student_id", id)
            .order("started_at", { ascending: false }),
        )
      : structuredClone(
          (await this.localAll<QuizAttempt>("attempts")).filter(
            (a) => a.student_id === id,
          ),
        );
  }
  async listExpiredAttempts(): Promise<QuizAttempt[]> {
    if (this.mysql && !this.mysql.inTransaction)
      return this.mysql.transaction(() => this.listExpiredAttempts());
    return this.isLive
      ? this.query(
          this.supabase!.from("quiz_attempts")
            .select("*")
            .eq("status", "in_progress")
            .lte("deadline_at", new Date().toISOString())
            .limit(100),
        )
      : structuredClone(
          (await this.localAll<QuizAttempt>("attempts")).filter(
            (a) =>
              a.status === "in_progress" &&
              Date.parse(a.deadline_at) <= Date.now(),
          ),
        );
  }
  async createAttempt(
    input: Partial<QuizAttempt> &
      Pick<
        QuizAttempt,
        | "quiz_id"
        | "student_id"
        | "deadline_at"
        | "max_score"
        | "question_order"
      >,
  ): Promise<QuizAttempt> {
    if (this.mysql && !this.mysql.inTransaction)
      return this.mysql.transaction(() => this.createAttempt(input));
    const row = {
      attempt_number: 1,
      status: "in_progress",
      score: 0,
      is_graded: false,
      warning_count: 0,
      ...input,
      id: input.id || randomUUID(),
      started_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as QuizAttempt;
    if (this.isLive)
      return this.query(
        this.supabase!.from("quiz_attempts").insert(row).select().single(),
      );
    await this.localPut("attempts", row.id, row);
    return row;
  }
  async updateAttempt(
    id: string,
    updates: Partial<QuizAttempt>,
  ): Promise<QuizAttempt> {
    if (this.mysql && !this.mysql.inTransaction)
      return this.mysql.transaction(() => this.updateAttempt(id, updates));
    const { quiz, student_profile, ...values } = updates;
    if (this.isLive)
      return this.query(
        this.supabase!.from("quiz_attempts")
          .update(values)
          .eq("id", id)
          .select()
          .single(),
      );
    const previous = (await this.localGet<QuizAttempt>("attempts", id))!;
    const gradingChanged = "score" in values || "is_graded" in values;
    const row = {
      ...previous,
      ...values,
      ...(gradingChanged
        ? {
            score_revision: (previous.score_revision || 0) + 1,
            score_confirmed_at: null,
            score_confirmed_by: null,
          }
        : {}),
      updated_at: new Date().toISOString(),
    };
    await this.localPut("attempts", id, row);
    return row;
  }
  async saveAnswer(
    attemptId: string,
    questionId: string,
    answer: any,
  ): Promise<AttemptAnswer> {
    if (this.mysql && !this.mysql.inTransaction)
      return this.mysql.transaction(() =>
        this.saveAnswer(attemptId, questionId, answer),
      );
    if (this.isLive)
      return this.query(
        this.supabase!.from("attempt_answers")
          .upsert(
            { attempt_id: attemptId, question_id: questionId, answer },
            { onConflict: "attempt_id,question_id" },
          )
          .select()
          .single(),
      );
    const key = `${attemptId}_${questionId}`;
    const row = {
      id: randomUUID(),
      is_manually_graded: false,
      ...(await this.localGet<AttemptAnswer>("answers", key)),
      attempt_id: attemptId,
      question_id: questionId,
      answer,
      updated_at: new Date().toISOString(),
    };
    await this.localPut("answers", key, row);
    return row;
  }
  async getAnswersByAttempt(id: string): Promise<AttemptAnswer[]> {
    if (this.mysql && !this.mysql.inTransaction)
      return this.mysql.transaction(() => this.getAnswersByAttempt(id));
    return this.isLive
      ? this.query(
          this.supabase!.from("attempt_answers")
            .select("*")
            .eq("attempt_id", id),
        )
      : structuredClone(
          (await this.localAll<AttemptAnswer>("answers")).filter(
            (a) => a.attempt_id === id,
          ),
        );
  }
  async updateAnswerGrade(
    id: string,
    score: number,
    feedback?: string,
  ): Promise<AttemptAnswer> {
    if (this.mysql && !this.mysql.inTransaction)
      return this.mysql.transaction(() =>
        this.updateAnswerGrade(id, score, feedback),
      );
    const updates = {
      score_awarded: score,
      ...(feedback !== undefined ? { teacher_feedback: feedback } : {}),
      is_manually_graded: true,
      updated_at: new Date().toISOString(),
    };
    if (this.isLive)
      return this.query(
        this.supabase!.from("attempt_answers")
          .update(updates)
          .eq("id", id)
          .select()
          .single(),
      );
    const row = (await this.localAll<AttemptAnswer>("answers")).find(
      (a) => a.id === id,
    );
    if (!row) throw new Error("Answer not found");
    Object.assign(row, updates);
    await this.localPut("answers", `${row.attempt_id}_${row.question_id}`, row);
    return structuredClone(row);
  }
  async logIncident(
    attemptId: string,
    type: IncidentType,
    warning: number,
    details?: any,
  ): Promise<QuizIncident> {
    if (this.mysql && !this.mysql.inTransaction)
      return this.mysql.transaction(() =>
        this.logIncident(attemptId, type, warning, details),
      );
    const row = {
      id: randomUUID(),
      attempt_id: attemptId,
      incident_type: type,
      warning_number: warning,
      details: details || {},
      occurred_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
    if (this.isLive)
      return this.query(
        this.supabase!.from("quiz_incidents").insert(row).select().single(),
      );
    await this.localPut("incidents", row.id, row);
    return structuredClone(row);
  }
  async getIncidentsByAttempt(id: string): Promise<QuizIncident[]> {
    if (this.mysql && !this.mysql.inTransaction)
      return this.mysql.transaction(() => this.getIncidentsByAttempt(id));
    return this.isLive
      ? this.query(
          this.supabase!.from("quiz_incidents")
            .select("*")
            .eq("attempt_id", id)
            .order("occurred_at"),
        )
      : structuredClone(
          (await this.localAll<QuizIncident>("incidents"))
            .filter((i) => i.attempt_id === id)
            .sort(
              (a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at),
            ),
        );
  }
  async getAllIncidents(): Promise<QuizIncident[]> {
    if (this.mysql && !this.mysql.inTransaction)
      return this.mysql.transaction(() => this.getAllIncidents());
    return this.isLive
      ? this.query(this.supabase!.from("quiz_incidents").select("*"))
      : structuredClone(await this.localAll<QuizIncident>("incidents"));
  }
}
