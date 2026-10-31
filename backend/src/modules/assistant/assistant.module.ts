import { Module } from "@nestjs/common";
import { ReportsModule } from "../reports/reports.module";
import { AttemptsModule } from "../attempts/attempts.module";
import { AssistantController } from "./assistant.controller";
import { AssistantService } from "./assistant.service";
@Module({
  imports: [ReportsModule, AttemptsModule],
  controllers: [AssistantController],
  providers: [AssistantService],
})
export class AssistantModule {}
