import {
  IsEmail,
  IsNotEmpty,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import { Transform } from "class-transformer";
import { UserRole } from "../../common/types";

export class LoginDto {
  @IsOptional()
  @IsIn(["teacher", "student"])
  role?: UserRole;
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @MaxLength(254)
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  password?: string;
}

export class RegisterDto {
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @MaxLength(254)
  @IsEmail()
  email: string;

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @MaxLength(120)
  @IsNotEmpty()
  @IsString()
  full_name: string;

  @IsIn(["teacher", "student"])
  role: UserRole;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  password?: string;
}

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  refresh_token: string;
}

export class LogoutDto {
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  refresh_token?: string;
}
