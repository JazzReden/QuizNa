import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
  Equals,
} from "class-validator";
export class IssuePaperDto {
  @IsOptional() @IsIn(["a4", "long_bond"]) paper_format?: "a4" | "long_bond";
  @IsUUID() section_id: string;
  @IsEmail() @MaxLength(254) student_email: string;
}
export class PreparePaperSectionDto {
  @IsOptional() @IsIn(["a4", "long_bond"]) paper_format?: "a4" | "long_bond";
  @IsUUID() section_id: string;
}
export class ResolvePaperDto {
  @IsString() @MaxLength(180) code: string;
}
export class PaperAnswerDto {
  @IsUUID() question_id: string;
  @IsOptional() @IsString() @MaxLength(50000) answer: string | null;
}
export class SavePaperDto {
  @IsBoolean() @Equals(true) reviewed: boolean;
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => PaperAnswerDto)
  answers: PaperAnswerDto[];
}
