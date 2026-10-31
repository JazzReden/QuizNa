import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AttemptsService } from './attempts.service';
import { StartAttemptDto, SubmitAttemptDto } from './attempts.dto';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserProfile } from '../../common/types';

@Controller('api/attempts')
@UseGuards(AuthGuard)
export class AttemptsController {
  constructor(private attemptsService: AttemptsService) {}

  // Student: start or resume quiz attempt with access code
  @Post('start')
  @UseGuards(RolesGuard)
  @Roles('student')
  startOrResume(
    @CurrentUser() user: UserProfile,
    @Body() dto: StartAttemptDto,
  ) {
    return this.attemptsService.startOrResumeAttempt(user, dto.access_code);
  }

  // Student: submit attempt
  @Post(':id/submit')
  @UseGuards(RolesGuard)
  @Roles('student')
  submit(
    @Param('id') id: string,
    @CurrentUser() user: UserProfile,
    @Body() dto: SubmitAttemptDto,
  ) {
    return this.attemptsService.submitAttempt(id, user.id, dto?.is_timeout);
  }

  // Student: list their own past attempts
  @Get('my')
  @UseGuards(RolesGuard)
  @Roles('student')
  listMyAttempts(@CurrentUser() user: UserProfile) {
    return this.attemptsService.listForStudent(user.id);
  }

  @Get("performance")
  @UseGuards(RolesGuard)
  @Roles("student")
  performance(@CurrentUser() user: UserProfile) {
    return this.attemptsService.getStudentPerformance(user.id);
  }

  // Student: review result of their own attempt
  @Get(':id/result')
  @UseGuards(RolesGuard)
  @Roles('student')
  getResult(@Param('id') id: string, @CurrentUser() user: UserProfile) {
    return this.attemptsService.getStudentResult(id, user.id);
  }

  // Teacher: force submit an attempt
  @Post(':id/force-submit')
  @UseGuards(RolesGuard)
  @Roles('teacher')
  forceSubmit(
    @Param('id') id: string,
    @CurrentUser() user: UserProfile,
  ) {
    return this.attemptsService.forceSubmitByTeacher(id, user.id);
  }

  // Teacher: list all attempts for a specific quiz
  @Get('quiz/:quizId')
  @UseGuards(RolesGuard)
  @Roles('teacher')
  listForQuiz(
    @Param('quizId') quizId: string,
    @CurrentUser() user: UserProfile,
  ) {
    return this.attemptsService.listForQuiz(quizId, user.id);
  }

  // Get specific attempt details
  @Get(':id')
  getAttempt(@Param('id') id: string, @CurrentUser() user: UserProfile) {
    return this.attemptsService.getAttempt(id, user.id);
  }
}
