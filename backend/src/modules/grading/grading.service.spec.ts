import { ConfigModule } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { Question } from "../../common/types";
import { DatabaseService } from "../../database/database.service";
import { GradingService } from "./grading.service";

describe("GradingService", () => {
  let service: GradingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [GradingService, DatabaseService],
    }).compile();

    service = module.get<GradingService>(GradingService);
  });

  it("should accurately auto-grade single-choice MCQ", () => {
    const question: Question = {
      id: "q-mcq",
      quiz_id: "quiz-1",
      type: "mcq",
      prompt: "What is 2 + 2?",
      points: 5.0,
      order_index: 0,
      correct_answer: "opt_4",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const strategy = service.getStrategy("mcq");

    // Correct choice
    const correctRes = strategy.grade(question, "opt_4");
    expect(correctRes.isCorrect).toBe(true);
    expect(correctRes.scoreAwarded).toBe(5.0);

    // Incorrect choice
    const wrongRes = strategy.grade(question, "opt_2");
    expect(wrongRes.isCorrect).toBe(false);
    expect(wrongRes.scoreAwarded).toBe(0);

    // Missing choice
    const nullRes = strategy.grade(question, null);
    expect(nullRes.isCorrect).toBe(false);
    expect(nullRes.scoreAwarded).toBe(0);
  });

  it("should accurately auto-grade True/False questions", () => {
    const question: Question = {
      id: "q-tf",
      quiz_id: "quiz-1",
      type: "true_false",
      prompt: "The sky is green.",
      points: 2.0,
      order_index: 1,
      correct_answer: "opt_false",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const strategy = service.getStrategy("true_false");

    const correctRes = strategy.grade(question, "opt_false");
    expect(correctRes.isCorrect).toBe(true);
    expect(correctRes.scoreAwarded).toBe(2.0);

    const wrongRes = strategy.grade(question, "opt_true");
    expect(wrongRes.isCorrect).toBe(false);
    expect(wrongRes.scoreAwarded).toBe(0);
  });

  it("should auto-grade short answer with case-insensitivity and whitespace trimming", () => {
    const question: Question = {
      id: "q-sa",
      quiz_id: "quiz-1",
      type: "short_answer",
      prompt: "Name the capital of France.",
      points: 3.0,
      order_index: 2,
      correct_answer: ["Paris", "paris", "City of Paris"],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const strategy = service.getStrategy("short_answer");

    // Lowercase match with padding
    const match1 = strategy.grade(question, "  pAris  ");
    expect(match1.isCorrect).toBe(true);
    expect(match1.scoreAwarded).toBe(3.0);

    // Alternative accepted match
    const match2 = strategy.grade(question, "City of Paris");
    expect(match2.isCorrect).toBe(true);
    expect(match2.scoreAwarded).toBe(3.0);

    // Non-match
    const noMatch = strategy.grade(question, "London");
    expect(noMatch.isCorrect).toBe(false);
    expect(noMatch.scoreAwarded).toBe(0);
  });

  it("should flag essays as requiring manual grading", () => {
    const question: Question = {
      id: "q-essay",
      quiz_id: "quiz-1",
      type: "essay",
      prompt: "Discuss the impact of AI on education.",
      points: 10.0,
      order_index: 3,
      rubric: "Coherence (4 pts), Evidence (3 pts), Grammar (3 pts)",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const strategy = service.getStrategy("essay");
    const result = strategy.grade(
      question,
      "AI is transforming customized learning...",
    );
    expect(result.isAutoGraded).toBe(false);
    expect(result.scoreAwarded).toBe(0);
  });
});
