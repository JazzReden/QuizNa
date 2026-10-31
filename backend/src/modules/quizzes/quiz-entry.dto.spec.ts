import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateQuizDto, UpdateQuizDto } from "./quizzes.dto";
it("accepts native quiz-entry booleans and rejects null or string values", async () => {
  for (const value of [true, false]) {
    expect(
      await validate(
        plainToInstance(CreateQuizDto, {
          title: "Quiz",
          require_access_code: value,
        }),
      ),
    ).toHaveLength(0);
    expect(
      await validate(
        plainToInstance(UpdateQuizDto, { require_access_code: value }),
      ),
    ).toHaveLength(0);
  }
  for (const value of [null, "false", "true", 1]) {
    expect(
      (
        await validate(
          plainToInstance(CreateQuizDto, {
            title: "Quiz",
            require_access_code: value,
          }),
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(
      (
        await validate(
          plainToInstance(UpdateQuizDto, { require_access_code: value }),
        )
      ).length,
    ).toBeGreaterThan(0);
  }
});
