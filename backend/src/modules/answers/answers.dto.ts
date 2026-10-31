import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class SaveAnswerDto {
  @IsString()
  @IsNotEmpty()
  question_id: string;

  @IsOptional()
  @IsString()
  @MaxLength(50000)
  answer: string | null;
}
