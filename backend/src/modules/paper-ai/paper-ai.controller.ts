import {
  Body,
  Controller,
  Get,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import { Type } from "class-transformer";
import { IsInt, IsUUID, Max, Min } from "class-validator";
import { AuthGuard } from "../../common/guards/auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { UserProfile } from "../../common/types";
import { EssayImage, PaperAiService } from "./paper-ai.service";
export class PaperAiDto {
  @IsUUID() sheet_id: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(500) page_index: number;
}
@Controller("api/paper-ai")
@UseGuards(AuthGuard, RolesGuard)
@Roles("teacher")
export class PaperAiController {
  constructor(private ai: PaperAiService) {}
  @Get("options") options() {
    return this.ai.options();
  }
  @Post("suggest")
  @Throttle({ default: { limit: 6, ttl: 60000 } })
  @UseInterceptors(
    FilesInterceptor("images", 8, {
      limits: { files: 8, fileSize: 700000, fields: 2, parts: 10 },
    }),
  )
  suggest(
    @CurrentUser() user: UserProfile,
    @Body() dto: PaperAiDto,
    @UploadedFiles() images: EssayImage[],
  ) {
    return this.ai.suggest(dto.sheet_id, dto.page_index, user.id, images);
  }
}
