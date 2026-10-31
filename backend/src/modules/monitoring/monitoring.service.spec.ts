import { ConfigModule } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { QuizAttempt } from "../../common/types";
import { DatabaseService } from "../../database/database.service";
import { AttemptsService } from "../attempts/attempts.service";
import { GradingService } from "../grading/grading.service";
import { MonitoringService } from "./monitoring.service";

describe("MonitoringService", () => {
  let monitoringService: MonitoringService;
  let db: DatabaseService;
  let attempt: QuizAttempt;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [
        MonitoringService,
        AttemptsService,
        GradingService,
        DatabaseService,
      ],
    }).compile();

    monitoringService = module.get<MonitoringService>(MonitoringService);

    db = module.get<DatabaseService>(DatabaseService);

    // Create an attempt started 5 seconds ago (past initial tolerance window)
    attempt = await db.createAttempt({
      quiz_id: "c0000000-0000-0000-0000-000000000001",
      student_id: "b0000000-0000-0000-0000-000000000002",
      deadline_at: new Date(Date.now() + 600000).toISOString(),
      max_score: 12.0,
      question_order: [],
    });
    // Set started_at to 10 seconds ago
    await db.updateAttempt(attempt.id, {
      started_at: new Date(Date.now() - 10000).toISOString(),
    });
  });

  it("should issue first warning on initial violation", async () => {
    const res = await monitoringService.reportIncident(
      attempt.id,
      attempt.student_id,
      "tab_hidden",
      { reason: "User switched tab" },
    );

    expect(res.deduplicated).toBe(false);
    expect(res.warning_number).toBe(1);
    expect(res.action_taken).toBe("first_warning");

    const freshAttempt = await db.getAttemptById(attempt.id);
    expect(freshAttempt?.warning_count).toBe(1);
    expect(freshAttempt?.status).toBe("in_progress");
  });

  it("should deduplicate cascading events occurring in rapid succession (<2000ms)", async () => {
    // 1st incident
    const res1 = await monitoringService.reportIncident(
      attempt.id,
      attempt.student_id,
      "fullscreen_exit",
    );
    expect(res1.deduplicated).toBe(false);
    expect(res1.warning_number).toBe(1);

    // Cascaded blur event firing 50ms later
    const res2 = await monitoringService.reportIncident(
      attempt.id,
      attempt.student_id,
      "window_blur",
    );
    expect(res2.deduplicated).toBe(true);

    // Cascaded visibilitychange firing 100ms later
    const res3 = await monitoringService.reportIncident(
      attempt.id,
      attempt.student_id,
      "tab_hidden",
    );
    expect(res3.deduplicated).toBe(true);

    // Warning count remains 1
    const freshAttempt = await db.getAttemptById(attempt.id);
    expect(freshAttempt?.warning_count).toBe(1);
  });

  it("should terminate attempt on third violation", async () => {
    // Manually set warning count to 2
    await db.updateAttempt(attempt.id, { warning_count: 2 });

    const res = await monitoringService.reportIncident(
      attempt.id,
      attempt.student_id,
      "tab_hidden",
    );

    expect(res.deduplicated).toBe(false);
    expect(res.warning_number).toBe(3);
    expect(res.action_taken).toBe("terminated");

    const finalizedAttempt = await db.getAttemptById(attempt.id);
    expect(finalizedAttempt?.status).toBe("terminated_violation");
    expect(finalizedAttempt?.submitted_at).toBeDefined();
  });
});
