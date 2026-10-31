import { IsIn, IsObject, IsOptional } from "class-validator";
import { IncidentType } from "../../common/types";

export class ReportIncidentDto {
  @IsIn(["tab_hidden", "window_blur", "fullscreen_exit"])
  incident_type: IncidentType;

  @IsOptional()
  @IsObject()
  details?: Record<string, any>;
}
