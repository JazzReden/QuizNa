import { Throttle } from "@nestjs/throttler";
import {
  Body,
  ParseUUIDPipe,
  Controller,
  Get,
  Delete,
  Param,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import {
  IsOptional,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
  IsEmail,
  IsUUID,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import { Transform, Type } from "class-transformer";
import { AuthGuard } from "../../common/guards/auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { UserProfile } from "../../common/types";
import { SectionsService } from "./sections.service";
class CreateSectionDto {
  @IsString()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @MinLength(1)
  @MaxLength(80)
  name: string;
}
class AssignSectionDto {
  @IsOptional()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  section_id?: string | null;
}
class AttachClassDto {
  @IsUUID() class_section_id: string;
}
class RosterStudentDto {
  @IsString() @MinLength(1) @MaxLength(160) full_name: string;
  @IsEmail() @MaxLength(254) email: string;
}
class RosterBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => RosterStudentDto)
  students: RosterStudentDto[];
}
@Controller("api/sections")
@UseGuards(AuthGuard, RolesGuard)
@Roles("teacher")
export class SectionsController {
  constructor(private readonly sections: SectionsService) {}
  @Get() classes(@CurrentUser() user: UserProfile) {
    return this.sections.listClasses(user.id);
  }
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post()
  createClass(@CurrentUser() user: UserProfile, @Body() dto: CreateSectionDto) {
    return this.sections.createClass(user.id, dto.name);
  }
  @Get(":classId/students") roster(
    @Param("classId", new ParseUUIDPipe()) id: string,
    @CurrentUser() user: UserProfile,
  ) {
    return this.sections.roster(id, user.id);
  }
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post(":classId/students")
  addStudents(
    @Param("classId", new ParseUUIDPipe()) id: string,
    @CurrentUser() user: UserProfile,
    @Body() dto: RosterBatchDto,
  ) {
    return this.sections.addStudents(id, user.id, dto.students);
  }
  @Delete(":classId/students/:studentId") removeStudent(
    @Param("classId", new ParseUUIDPipe()) id: string,
    @Param("studentId", new ParseUUIDPipe()) studentId: string,
    @CurrentUser() user: UserProfile,
  ) {
    return this.sections.removeStudent(id, user.id, studentId);
  }
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post("quiz/:quizId/attach")
  attach(
    @Param("quizId") id: string,
    @CurrentUser() user: UserProfile,
    @Body() dto: AttachClassDto,
  ) {
    return this.sections.attach(id, user.id, dto.class_section_id);
  }
  @Get("quiz/:quizId") list(
    @Param("quizId") quizId: string,
    @CurrentUser() user: UserProfile,
  ) {
    return this.sections.list(quizId, user.id);
  }
  @Post("quiz/:quizId") create(
    @Param("quizId") quizId: string,
    @CurrentUser() user: UserProfile,
    @Body() dto: CreateSectionDto,
  ) {
    return this.sections.create(quizId, user.id, dto.name);
  }
  @Put("attempt/:id") assign(
    @Param("id") id: string,
    @CurrentUser() user: UserProfile,
    @Body() dto: AssignSectionDto,
  ) {
    return this.sections.assign(id, user.id, dto.section_id ?? null);
  }
}
