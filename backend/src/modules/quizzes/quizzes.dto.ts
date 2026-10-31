import { Transform } from "class-transformer";
import {
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsBoolean,
  IsDateString,
  IsIn,
} from "class-validator";
import { QuizStatus } from "../../common/types";

export class CopyQuizDto {
  @IsUUID() target_subject_id: string;
  @IsUUID() request_id: string;
}

export class CreateQuizDto {
  @ValidateIf((_o, value) => value !== undefined)
  @IsBoolean()
  require_access_code?: boolean;
  @IsOptional()
  @IsUUID()
  client_draft_id?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().replace(/\s+/g, " ") : value,
  )
  @IsString()
  @MaxLength(120)
  subject?: string;

  @ValidateIf((_o, v) => v !== undefined)
  @IsIn(["online", "paper"])
  exam_format?: "online" | "paper";
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  instructions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  access_code?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10080)
  time_limit_minutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  max_attempts?: number;

  @IsOptional()
  @IsBoolean()
  randomize_questions?: boolean;

  @IsOptional()
  @IsBoolean()
  randomize_options?: boolean;

  @IsOptional()
  @IsDateString()
  available_from?: string;

  @IsOptional()
  @IsDateString()
  available_until?: string;

  @IsOptional()
  @IsBoolean()
  release_scores_immediately?: boolean;

  @IsOptional()
  @IsBoolean()
  release_answers_immediately?: boolean;
}

export class UpdateQuizDto {
  @ValidateIf((_o, value) => value !== undefined)
  @IsBoolean()
  require_access_code?: boolean;
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().replace(/\s+/g, " ") : value,
  )
  @IsString()
  @MaxLength(120)
  subject?: string;

  @ValidateIf((_o, v) => v !== undefined)
  @IsIn(["online", "paper"])
  exam_format?: "online" | "paper";
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  instructions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  access_code?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10080)
  time_limit_minutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  max_attempts?: number;

  @IsOptional()
  @IsBoolean()
  randomize_questions?: boolean;

  @IsOptional()
  @IsBoolean()
  randomize_options?: boolean;

  @IsOptional()
  @IsDateString()
  available_from?: string;

  @IsOptional()
  @IsDateString()
  available_until?: string;

  @IsOptional()
  @IsBoolean()
  release_scores_immediately?: boolean;

  @IsOptional()
  @IsBoolean()
  release_answers_immediately?: boolean;

  @IsOptional()
  @IsIn(["draft", "published", "archived"])
  status?: QuizStatus;
}
