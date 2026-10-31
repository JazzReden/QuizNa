import { Module } from "@nestjs/common";
import { QuizzesController } from "./quizzes.controller";
import { QuizzesService } from "./quizzes.service";
import { QuizCopyService } from "./quiz-copy.service";

@Module({
  controllers: [QuizzesController],
  providers: [QuizzesService, QuizCopyService],
  exports: [QuizzesService],
})
export class QuizzesModule {}
