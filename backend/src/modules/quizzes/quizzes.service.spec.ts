import { ForbiddenException } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { UserProfile } from "../../common/types";
import { DatabaseService } from "../../database/database.service";
import { QuizzesService } from "./quizzes.service";

describe("QuizzesService", () => {
  let service: QuizzesService;
  let db: DatabaseService;

  const teacherA: UserProfile = {
    id: "a0000000-0000-0000-0000-000000000001",
    email: "teacher@quizna.dev",
    full_name: "Prof. Sarah Connor",
    role: "teacher",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const teacherB: UserProfile = {
    id: "a0000000-0000-0000-0000-000000000009",
    email: "other_teacher@quizna.dev",
    full_name: "Dr. John Smith",
    role: "teacher",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [QuizzesService, DatabaseService],
    }).compile();

    service = module.get<QuizzesService>(QuizzesService);
    db = module.get<DatabaseService>(DatabaseService);
  });

  it("should allow teacher to create a quiz and auto-generate unique uppercase access code", async () => {
    const quiz = await service.create(teacherA, {
      title: "Operating Systems Quiz",
      time_limit_minutes: 45,
    });

    expect(quiz).toBeDefined();
    expect(quiz.access_code).toBeDefined();
    expect(quiz.access_code.length).toBe(6);
    expect(quiz.teacher_id).toBe(teacherA.id);
    expect(quiz.status).toBe("draft");
  });

  it("should prevent teacher B from editing or deleting teacher A quiz", async () => {
    const quizA = await service.create(teacherA, {
      title: "Sarah Quiz",
    });

    // Teacher B tries to update Teacher A's quiz
    await expect(
      service.update(quizA.id, teacherB.id, { title: "Compromised Title" }),
    ).rejects.toThrow(ForbiddenException);

    // Teacher B tries to delete Teacher A's quiz
    await expect(service.delete(quizA.id, teacherB.id)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("should freeze quiz snapshot into quiz_versions upon publishing", async () => {
    const quiz = await service.create(teacherA, {
      title: "Snapshot Test Quiz",
    });

    // Add a question
    await db.createQuestion({
      quiz_id: quiz.id,
      type: "mcq",
      prompt: "What is a thread?",
      points: 5.0,
      options: [
        { id: "1", text: "Lightweight process" },
        { id: "2", text: "Heavy process" },
      ],
      correct_answer: "1",
    });

    const published = await service.publish(quiz.id, teacherA.id);
    expect(published.status).toBe("published");
    expect(published.version).toBe(2);

    // Verify snapshot stored in quiz_versions
    const versionSnapshot = await db.getQuizVersion(quiz.id, 2);
    expect(versionSnapshot).toBeDefined();
    expect(versionSnapshot?.snapshot_data.title).toBe("Snapshot Test Quiz");
    expect(versionSnapshot?.snapshot_data.questions.length).toBe(1);
  });
});
