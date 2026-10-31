import { Module } from "@nestjs/common";
import { PaperController } from "./paper.controller";
import { PaperService } from "./paper.service";
import { GradingModule } from "../grading/grading.module";
@Module({
  imports: [GradingModule],
  controllers: [PaperController],
  providers: [PaperService],
  exports: [PaperService],
})
export class PaperModule {}
