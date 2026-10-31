import {SubjectsModule} from './modules/subjects/subjects.module';
import { PaperAiModule } from "./modules/paper-ai/paper-ai.module";
import { AssistantModule } from "./modules/assistant/assistant.module";
import { PaperModule } from "./modules/paper/paper.module";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
import { DatabaseModule } from "./database/database.module";
import { WorkersModule } from "./modules/workers/workers.module";
import { AuthModule } from "./modules/auth/auth.module";
import { QuizzesModule } from "./modules/quizzes/quizzes.module";
import { QuestionsModule } from "./modules/questions/questions.module";
import { AttemptsModule } from "./modules/attempts/attempts.module";
import { AnswersModule } from "./modules/answers/answers.module";
import { MonitoringModule } from "./modules/monitoring/monitoring.module";
import { GradingModule } from "./modules/grading/grading.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { SectionsModule } from "./modules/sections/sections.module";
import { AppController } from "./app.controller";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 60 seconds
        limit: 600, // Classroom clients may share an IP; verified accounts have a separate 240/minute aggregate budget
      },
    ]),
    DatabaseModule,
    AssistantModule,
    PaperModule,
    PaperAiModule,
    WorkersModule,
    AuthModule,
    QuizzesModule,
    QuestionsModule,
    AttemptsModule,
    AnswersModule,
    MonitoringModule,
    GradingModule,
    ReportsModule,
    SectionsModule,
    SubjectsModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
