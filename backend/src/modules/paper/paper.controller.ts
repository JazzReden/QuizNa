import {
  Body,
  ParseUUIDPipe,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AuthGuard } from "../../common/guards/auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { UserProfile } from "../../common/types";
import { PaperService } from "./paper.service";
import {
  IssuePaperDto,
  PreparePaperSectionDto,
  ResolvePaperDto,
  SavePaperDto,
} from "./paper.dto";
@Controller("api/paper")
@UseGuards(AuthGuard, RolesGuard)
@Roles("teacher")
export class PaperController {
  constructor(private paper: PaperService) {}
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post("quiz/:id/prepare-section")
  prepareSection(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() user: UserProfile,
    @Body() dto: PreparePaperSectionDto,
  ) {
    return this.paper.prepareSection(id, user.id, dto.section_id, dto.paper_format);
  }
  @Get("quiz/:id") list(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() user: UserProfile,
  ) {
    return this.paper.list(id, user.id);
  }
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post("quiz/:id/issue")
  issue(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() user: UserProfile,
    @Body() dto: IssuePaperDto,
  ) {
    return this.paper.issue(id, user.id, dto);
  }
  @Get("sheet/:id") get(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() user: UserProfile,
  ) {
    return this.paper.get(id, user.id);
  }
  @Throttle({ default: { limit: 30, ttl: 60000 } }) @Post("resolve") resolve(
    @CurrentUser() user: UserProfile,
    @Body() dto: ResolvePaperDto,
  ) {
    return this.paper.resolve(dto.code, user.id);
  }
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post("sheet/:id/save")
  save(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() user: UserProfile,
    @Body() dto: SavePaperDto,
  ) {
    return this.paper.save(id, user.id, dto);
  }
}
