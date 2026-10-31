import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { QuizzesService } from "./quizzes.service";
import { CreateQuizDto, UpdateQuizDto, CopyQuizDto } from "./quizzes.dto";
import { QuizCopyService } from "./quiz-copy.service";
import { AuthGuard } from "../../common/guards/auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { UserProfile } from "../../common/types";

@Controller("api/quizzes")
export class QuizzesController {
  constructor(
    private quizzesService: QuizzesService,
    private quizCopy: QuizCopyService,
  ) {}

  @Post(":id/copy")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles("teacher")
  @Throttle({ default: { limit: 8, ttl: 60000 } })
  copy(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() user: UserProfile,
    @Body() dto: CopyQuizDto,
  ) {
    return this.quizCopy.copy(
      id,
      user.id,
      dto.target_subject_id,
      dto.request_id,
    );
  }

  // Public/Student lookup by access code
  @Get("code/:code")
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @UseGuards(AuthGuard)
  getByAccessCode(
    @Param("code") code: string,
    @CurrentUser() user: UserProfile,
  ) {
    return this.quizzesService.getByAccessCodeForStudent(code, user.id);
  }

  // Teacher: list own quizzes
  @Get()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles("teacher")
  listForTeacher(@CurrentUser() user: UserProfile) {
    return this.quizzesService.listForTeacher(user.id);
  }

  // Teacher: get specific quiz with questions
  @Get(":id")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles("teacher")
  getById(@Param("id") id: string, @CurrentUser() user: UserProfile) {
    return this.quizzesService.getByIdForTeacher(id, user.id);
  }

  // Teacher: create quiz
  @Post()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles("teacher")
  create(@CurrentUser() user: UserProfile, @Body() dto: CreateQuizDto) {
    return this.quizzesService.create(user, dto);
  }

  // Teacher: update quiz
  @Put(":id")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles("teacher")
  update(
    @Param("id") id: string,
    @CurrentUser() user: UserProfile,
    @Body() dto: UpdateQuizDto,
  ) {
    return this.quizzesService.update(id, user.id, dto);
  }

  // Teacher: publish quiz (freezes version snapshot)
  @Post(":id/publish")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles("teacher")
  publish(@Param("id") id: string, @CurrentUser() user: UserProfile) {
    return this.quizzesService.publish(id, user.id);
  }

  // Teacher: delete quiz
  @Delete(":id")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles("teacher")
  delete(@Param("id") id: string, @CurrentUser() user: UserProfile) {
    return this.quizzesService.delete(id, user.id);
  }
}
