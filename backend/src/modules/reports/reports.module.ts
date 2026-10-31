import { TeacherInsightsService } from "./teacher-insights.service";
import { Module } from "@nestjs/common";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, TeacherInsightsService],
  exports: [ReportsService, TeacherInsightsService],
})
export class ReportsModule {}
