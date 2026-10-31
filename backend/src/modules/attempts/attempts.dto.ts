import { IsString, IsNotEmpty, IsOptional, IsBoolean, MaxLength } from 'class-validator';

export class StartAttemptDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(12)
  access_code: string;
}

export class SubmitAttemptDto {
  // Optional flag indicating if triggered by client timer expiration
  @IsOptional()
  @IsBoolean()
  is_timeout?: boolean;
}
