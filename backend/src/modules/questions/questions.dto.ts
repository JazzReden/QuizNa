import { Type } from "class-transformer";
import {
  IsString,
  IsNotEmpty,
  IsIn,
  IsNumber,
  IsOptional,
  IsArray,
  Min,
  Max,
  MaxLength,
  IsUUID,
  Matches,
  ArrayMinSize,
  ArrayMaxSize,
  ArrayUnique,
  ValidateNested,
} from "class-validator";
import { QuestionType, QuestionOption } from "../../common/types";

class ImportChoiceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  id: string;
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  text: string;
}
export class CreateQuestionDto {
  @IsOptional()
  @IsUUID()
  client_question_id?: string;

  @IsString()
  @IsNotEmpty()
  quiz_id: string;

  @IsIn(["mcq", "true_false", "short_answer", "essay"])
  type: QuestionType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  prompt: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  explanation?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99999999.99)
  points: number;

  @IsOptional()
  @IsNumber()
  order_index?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => ImportChoiceDto)
  options?: QuestionOption[];

  @IsOptional()
  correct_answer?: any;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  rubric?: string;
}

export class UpdateQuestionDto {
  @IsOptional()
  @IsIn(["mcq", "true_false", "short_answer", "essay"])
  type?: QuestionType;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  prompt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  explanation?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99999999.99)
  points?: number;

  @IsOptional()
  @IsNumber()
  order_index?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => ImportChoiceDto)
  options?: QuestionOption[];

  @IsOptional()
  correct_answer?: any;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  rubric?: string;
}

export class ImportQuestionDto {
  @IsOptional()
  @IsIn(["mcq", "true_false", "essay"])
  type?: "mcq" | "true_false" | "essay";
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  prompt: string;
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99999999.99)
  points: number;
  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => ImportChoiceDto)
  options: ImportChoiceDto[];
  @IsOptional()
  @IsString()
  @MaxLength(40)
  correct_answer?: string | null;
}
export class ImportQuestionsDto {
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  quiz_id: string;
  @IsUUID()
  import_id: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ImportQuestionDto)
  questions: ImportQuestionDto[];
}

export class DraftQuestionBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique((q: CreateQuestionDto) => q?.client_question_id)
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionDto)
  questions: CreateQuestionDto[];
}
