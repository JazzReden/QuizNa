import { Controller, Post, Get, Param, Body, UseGuards } from '@nestjs/common';
import { MonitoringService } from './monitoring.service';
import { ReportIncidentDto } from './monitoring.dto';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserProfile } from '../../common/types';

@Controller('api/monitoring')
@UseGuards(AuthGuard)
export class MonitoringController {
  constructor(private monitoringService: MonitoringService) {}

  // Student reports a monitoring incident
  @Post(':attemptId/incident')
  @UseGuards(RolesGuard)
  @Roles('student')
  reportIncident(
    @Param('attemptId') attemptId: string,
    @CurrentUser() user: UserProfile,
    @Body() dto: ReportIncidentDto,
  ) {
    return this.monitoringService.reportIncident(
      attemptId,
      user.id,
      dto.incident_type,
      dto.details,
    );
  }

  // Teacher: Pardon a strike on an attempt
  @Post(':attemptId/pardon')
  @UseGuards(RolesGuard)
  @Roles('teacher')
  pardonStrike(
    @Param('attemptId') attemptId: string,
    @CurrentUser() user: UserProfile,
  ) {
    return this.monitoringService.pardonStrike(attemptId, user.id);
  }

  // Teacher: get live monitoring status for a quiz
  @Get('quiz/:quizId/live')
  @UseGuards(RolesGuard)
  @Roles('teacher')
  getLiveFeed(
    @Param('quizId') quizId: string,
    @CurrentUser() user: UserProfile,
  ) {
    return this.monitoringService.getLiveMonitorFeed(user.id, quizId);
  }

  // Get incident log for an attempt
  @Get('attempt/:attemptId')
  getAttemptIncidents(
    @Param('attemptId') attemptId: string,
    @CurrentUser() user: UserProfile,
  ) {
    return this.monitoringService.getIncidentsForAttempt(attemptId, user.id);
  }
}
