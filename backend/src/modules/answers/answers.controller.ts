import { Controller, Post, Get, Param, Body, UseGuards } from '@nestjs/common';
import { AnswersService } from './answers.service';
import { SaveAnswerDto } from './answers.dto';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserProfile } from '../../common/types';

@Controller('api/answers')
@UseGuards(AuthGuard)
export class AnswersController {
  constructor(private answersService: AnswersService) {}

  @Post(':attemptId/save')
  autosave(
    @Param('attemptId') attemptId: string,
    @CurrentUser() user: UserProfile,
    @Body() dto: SaveAnswerDto,
  ) {
    return this.answersService.autosaveAnswer(attemptId, user.id, dto);
  }

  @Get(':attemptId')
  getAnswers(
    @Param('attemptId') attemptId: string,
    @CurrentUser() user: UserProfile,
  ) {
    return this.answersService.getAnswersForAttempt(attemptId, user.id);
  }
}
