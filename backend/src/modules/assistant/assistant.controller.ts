import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Request } from "express";
import { Throttle } from "@nestjs/throttler";
import { AuthGuard } from "../../common/guards/auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { UserProfile } from "../../common/types";
import { AssistantService } from "./assistant.service";
import { AssistantReportDto } from "./assistant.dto";
@Controller("api/assistant")
@UseGuards(AuthGuard, RolesGuard)
@Roles("teacher", "student")
@Throttle({ default: { limit: 60, ttl: 60000 } })
export class AssistantController {
  constructor(private assistant: AssistantService) {}
  @Get("options")
  @Roles("teacher")
  @Header("Cache-Control", "no-store")
  options(@CurrentUser() user: UserProfile) {
    return this.assistant.options(user);
  }
  @Get("report")
  @Header("Cache-Control", "no-store")
  report(
    @CurrentUser() user: UserProfile,
    @Query() query: AssistantReportDto,
    @Req() request: Request,
  ) {
    if (
      Object.keys(request.query).some(
        (key) => !["topic", "quizId", "sectionId", "classId"].includes(key),
      )
    )
      throw new BadRequestException("Unsupported report filter");
    return this.assistant.report(user, query);
  }
}
