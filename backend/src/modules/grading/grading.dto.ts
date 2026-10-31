import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MaxLength,
} from "class-validator";

export class GradeAnswerDto {
  @IsOptional() @IsBoolean() require_ungraded?: boolean;
  @IsOptional() @IsString() @MaxLength(50000) expected_answer?: string;
  @IsNumber()
  @Min(0)
  score_awarded: number;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  teacher_feedback?: string;
}

export class BatchGradeDto {
  @IsNumber()
  @Min(0)
  score_awarded: number;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  teacher_feedback?: string;
}

export class ConfirmScoreDto {
  @IsInt() @Min(0) expected_revision: number;
  @IsDateString() expected_updated_at: string;
}
