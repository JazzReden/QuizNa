import { Throttle } from "@nestjs/throttler";
import { Controller, Get, Param, Query, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { TeacherInsightsService } from "./teacher-insights.service";
import { ReportsService } from "./reports.service";
import { AuthGuard } from "../../common/guards/auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { UserProfile } from "../../common/types";

@Controller("api/reports")
@UseGuards(AuthGuard, RolesGuard)
@Roles("teacher")
export class ReportsController {
  constructor(
    private reportsService: ReportsService,
    private insights: TeacherInsightsService,
  ) {}

  @Get("section/:classId/gradebook")
  gradebook(
    @Param("classId") classId: string,
    @CurrentUser() user: UserProfile,
  ) {
    return this.insights.gradebook(classId, user.id);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Get("section/:classId/gradebook.csv")
  async gradebookCsv(
    @Param("classId") classId: string,
    @CurrentUser() user: UserProfile,
    @Res() res: Response,
  ) {
    const csv = await this.insights.gradebookCsv(classId, user.id);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="QuizNa_gradebook.csv"',
    );
    res.send(csv);
  }

  @Get("quiz/:quizId/analysis")
  analysis(
    @Param("quizId") quizId: string,
    @CurrentUser() user: UserProfile,
    @Query("section_id") sectionId?: string,
  ) {
    return this.insights.questionAnalysis(quizId, user.id, sectionId);
  }

  @Get("quiz/:quizId/leaderboard")
  leaderboard(
    @Param("quizId") quizId: string,
    @CurrentUser() user: UserProfile,
    @Query("section_id") sectionId?: string,
  ) {
    return this.reportsService.getLeaderboard(quizId, user.id, sectionId);
  }

  @Get("quiz/:quizId/class-list")
  classList(
    @Param("quizId") quizId: string,
    @CurrentUser() user: UserProfile,
    @Query("section_id") sectionId?: string,
  ) {
    return this.reportsService.getClassList(quizId, user.id, sectionId);
  }
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Get("quiz/:quizId/scorebook.csv")
  async scorebook(
    @Param("quizId") quizId: string,
    @CurrentUser() user: UserProfile,
    @Query("section_id") sectionId: string | undefined,
    @Query("status") status: string | undefined,
    @Res() res: Response,
  ) {
    const csv = await this.reportsService.exportScorebookCsv(
      quizId,
      user.id,
      sectionId,
      status,
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="quiz_${quizId}_scorebook.csv"`,
    );
    res.send(csv);
  }

  @Get("quiz/:quizId/stats")
  getStats(@Param("quizId") quizId: string, @CurrentUser() user: UserProfile) {
    return this.reportsService.getQuizStatistics(quizId, user.id);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Get("quiz/:quizId/csv")
  async exportCsv(
    @Param("quizId") quizId: string,
    @CurrentUser() user: UserProfile,
    @Query("section_id") sectionId: string | undefined,
    @Query("status") status: string | undefined,
    @Res() res: Response,
  ) {
    const csvContent = await this.reportsService.exportQuizCsv(
      quizId,
      user.id,
      sectionId,
      status,
    );

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="quiz_${quizId}_results.csv"`,
    );
    res.send(csvContent);
  }
}
