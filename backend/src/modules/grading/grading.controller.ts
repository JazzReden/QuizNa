import {
  Controller,
  Post,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from "@nestjs/common";
import { GradingService } from "./grading.service";
import { GradeAnswerDto, ConfirmScoreDto } from "./grading.dto";
import { AuthGuard } from "../../common/guards/auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { UserProfile } from "../../common/types";

@Controller("api/grading")
@UseGuards(AuthGuard, RolesGuard)
@Roles("teacher")
export class GradingController {
  constructor(private gradingService: GradingService) {}

  @Post("attempt/:attemptId/confirm")
  confirmScore(
    @Param("attemptId", new ParseUUIDPipe()) attemptId: string,
    @CurrentUser() user: UserProfile,
    @Body() dto: ConfirmScoreDto,
  ) {
    return this.gradingService.confirmScore(
      attemptId,
      user.id,
      dto.expected_updated_at,
      dto.expected_revision,
    );
  }

  @Post("answer/:answerId")
  gradeAnswer(
    @Param("answerId") answerId: string,
    @CurrentUser() user: UserProfile,
    @Body() dto: GradeAnswerDto,
  ) {
    return this.gradingService.manualGradeAnswer(answerId, user.id, dto);
  }
}
