import { Module } from "@nestjs/common";
import { AttemptsModule } from "../attempts/attempts.module";
import { SubjectsController } from "./subjects.controller";
import { SubjectsService } from "./subjects.service";
@Module({
  imports: [AttemptsModule],
  controllers: [SubjectsController],
  providers: [SubjectsService],
})
export class SubjectsModule {}
