import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from "@nestjs/common";
import { IsBoolean, IsString, IsUUID, Length, Matches } from "class-validator";
import { Throttle } from "@nestjs/throttler";
import { AuthGuard } from "../../common/guards/auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { UserProfile } from "../../common/types";
import { SubjectsService } from "./subjects.service";
class CreateSubjectDto {
  @IsString() @Length(1, 120) name: string;
  @IsUUID() class_section_id: string;
}
class JoinSubjectDto {
  @IsString() @Matches(/^SUB-[A-Fa-f0-9]{12}$/i) code: string;
}
class EnterQuizDto {
  @IsString()
  @Matches(/^[A-Za-z0-9-]{1,12}$/, {
    message: "Enter the quiz code from your teacher.",
  })
  code: string;
}
class AttachSubjectDto {
  @IsUUID() quiz_id: string;
}
class SubjectSettingsDto {
  @IsBoolean() leaderboard_enabled: boolean;
}
@Controller("api/subjects")
@UseGuards(AuthGuard, RolesGuard)
export class SubjectsController {
  constructor(private subjects: SubjectsService) {}
  @Get() list(@CurrentUser() user: UserProfile) {
    return this.subjects.list(user);
  }
  @Post()
  @Roles("teacher")
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  create(@CurrentUser() u: UserProfile, @Body() d: CreateSubjectDto) {
    return this.subjects.create(u, d.name, d.class_section_id);
  }
  @Post("join")
  @Roles("student")
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  join(@CurrentUser() u: UserProfile, @Body() d: JoinSubjectDto) {
    return this.subjects.join(u, d.code);
  }
  @Get(":id") detail(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() u: UserProfile,
  ) {
    return this.subjects.detail(id, u);
  }
  @Get(":id/leaderboard") leaderboard(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() u: UserProfile,
  ) {
    return this.subjects.leaderboard(id, u);
  }
  @Put(":id/settings") @Roles("teacher") settings(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() u: UserProfile,
    @Body() d: SubjectSettingsDto,
  ) {
    return this.subjects.settings(id, u, d.leaderboard_enabled);
  }
  @Post(":id/quizzes/:quizId/enter")
  @Roles("student")
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  enterQuiz(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("quizId", new ParseUUIDPipe()) quizId: string,
    @CurrentUser() user: UserProfile,
    @Body() dto: EnterQuizDto,
  ) {
    return this.subjects.enterQuiz(id, quizId, dto.code, user);
  }
  @Post(":id/quizzes") @Roles("teacher") attach(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() u: UserProfile,
    @Body() d: AttachSubjectDto,
  ) {
    return this.subjects.attach(id, d.quiz_id, u);
  }
}
