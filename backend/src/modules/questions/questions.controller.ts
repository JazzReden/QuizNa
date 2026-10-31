import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { QuestionsService } from './questions.service';
import {
  CreateQuestionDto,
  DraftQuestionBatchDto,
  UpdateQuestionDto,
  ImportQuestionsDto,
} from './questions.dto';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserProfile } from '../../common/types';

@Controller('api/questions')
@UseGuards(AuthGuard, RolesGuard)
@Roles('teacher')
export class QuestionsController {
  constructor(private questionsService: QuestionsService) {}

  @Get('quiz/:quizId')
  listByQuiz(
    @Param('quizId') quizId: string,
    @CurrentUser() user: UserProfile,
  ) {
    return this.questionsService.listByQuiz(quizId, user.id);
  }

  @Post('import')
  importQuestions(
    @CurrentUser() user: UserProfile,
    @Body() dto: ImportQuestionsDto,
  ) {
    return this.questionsService.importQuestions(user.id, dto);
  }

  @Post('draft-batch')
  saveDraftBatch(@CurrentUser() user: UserProfile, @Body() dto: DraftQuestionBatchDto) {
    return this.questionsService.saveDraftBatch(user.id, dto.questions);
  }

  @Post()
  create(@CurrentUser() user: UserProfile, @Body() dto: CreateQuestionDto) {
    return this.questionsService.create(user.id, dto);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: UserProfile,
    @Body() dto: UpdateQuestionDto,
  ) {
    return this.questionsService.update(id, user.id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @CurrentUser() user: UserProfile) {
    return this.questionsService.delete(id, user.id);
  }
}
