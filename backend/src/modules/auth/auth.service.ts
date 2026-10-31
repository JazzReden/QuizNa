import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from "@nestjs/common";
import { DatabaseService } from "../../database/database.service";
import { UserProfile } from "../../common/types";
import { LoginDto, RegisterDto } from "./auth.dto";

@Injectable()
export class AuthService {
  constructor(private db: DatabaseService) {}

  async me(user: UserProfile): Promise<UserProfile> {
    const profile = await this.db.getProfile(user.id);
    if (!profile) throw new UnauthorizedException("Profile not found");
    return profile;
  }

  async login(
    dto: LoginDto,
  ): Promise<{ token: string; refresh_token?: string; profile: UserProfile }> {
    const email = dto.email.trim().toLowerCase();
    if (this.db.isMysql) return this.db.localAuth.login(dto);
    if (this.db.isDemo) {
      const tokens: Record<string, string> = {
        "teacher@quizna.dev": "teacher-token",
        "student@quizna.dev": "student-token",
        "student2@quizna.dev": "student2-token",
      };
      const profile = await this.db.getProfileByEmail(email);
      if (!profile || !tokens[email])
        throw new UnauthorizedException("Use a seeded account in demo mode");
      if (dto.role && profile.role !== dto.role)
        throw new UnauthorizedException(
          "This account does not match the selected account type. Choose Teacher or Student and try again.",
        );
      return { token: tokens[email], profile };
    }
    if (!dto.password)
      throw new UnauthorizedException("Email and password are required");
    // Use a separate Auth client: signing in must not replace the service-role client's session.
    const { createClient } = await import("@supabase/supabase-js");
    const auth = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await auth.auth.signInWithPassword({
      email,
      password: dto.password,
    });
    if (error || !data.session || !data.user)
      throw new UnauthorizedException("Invalid email or password");
    const profile = await this.db.getProfile(data.user.id);
    if (!profile)
      throw new UnauthorizedException("Account profile unavailable");
    if (dto.role && profile.role !== dto.role) {
      await auth.auth.signOut({ scope: "local" });
      throw new UnauthorizedException(
        "This account does not match the selected account type. Choose Teacher or Student and try again.",
      );
    }
    return {
      token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      profile,
    };
  }

  async refresh(refreshToken: string) {
    if (this.db.isMysql) return this.db.localAuth.refresh(refreshToken);
    if (this.db.isDemo) throw new UnauthorizedException("Session unavailable");
    const { createClient } = await import("@supabase/supabase-js");
    const auth = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await auth.auth.refreshSession({
      refresh_token: refreshToken,
    });
    if (error || !data.session)
      throw new UnauthorizedException("Please sign in again");
    return {
      token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    };
  }

  options() {
    return {
      passwordLogin: !this.db.isDemo || this.db.isMysql,
      registration:
        !this.db.isDemo ||
        (this.db.isMysql && process.env.LOCAL_REGISTRATION_ENABLED !== "false"),
      teacherRegistration:
        !!this.db.isMysql && process.env.LOCAL_REGISTRATION_ENABLED !== "false",
      demoLogin: this.db.isDemo && !this.db.isMysql,
      localAccounts: !!this.db.isMysql,
    };
  }
  async logout(accessToken?: string, refreshToken?: string) {
    if (this.db.isMysql)
      await this.db.localAuth.logout(accessToken, refreshToken);
    return { success: true };
  }

  async register(
    dto: RegisterDto,
  ): Promise<{ token: string; refresh_token?: string; profile: UserProfile }> {
    if (this.db.isMysql) {
      if (process.env.LOCAL_REGISTRATION_ENABLED === "false")
        throw new BadRequestException(
          "Registration is closed. Please sign in with an existing account.",
        );
      return this.db.localAuth.register(dto);
    }
    if (this.db.isDemo)
      throw new BadRequestException(
        "Registration requires a persistent database. Use a demo account locally.",
      );
    if (!dto.password || dto.password.length < 10)
      throw new BadRequestException(
        "Use a password with at least 10 characters",
      );
    // Public registrations are students. Promote teachers using a trusted administrative workflow.
    if (dto.role !== "student")
      throw new BadRequestException(
        "Teacher accounts must be approved by an administrator",
      );
    const { createClient } = await import("@supabase/supabase-js");
    const auth = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await auth.auth.signUp({
      email: dto.email.trim().toLowerCase(),
      password: dto.password,
      options: { data: { full_name: dto.full_name } },
    });
    if (error || !data.user)
      throw new BadRequestException(
        "Unable to register. Check your details and try again",
      );
    if (!data.session)
      throw new BadRequestException(
        "Check your email to confirm your account, then sign in",
      );
    const profile = await this.db.getProfile(data.user.id);
    if (!profile)
      throw new BadRequestException(
        "Account profile unavailable. Contact your administrator",
      );
    return {
      token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      profile,
    };
  }
}
