import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { MysqlLocalStore } from "../../database/mysql-local.store";
import { UserProfile } from "../../common/types";
import { LoginDto, RegisterDto } from "./auth.dto";
import { LocalPassword } from "./local-password";

/** Local development accounts only; DatabaseService forbids this mode in production. */
export class LocalAuthService {
  constructor(private store: MysqlLocalStore) {}
  private digest(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }
  private async session(
    userId: string,
    refreshExpiresAt = new Date(Date.now() + 7 * 86400000).toISOString(),
  ) {
    const token = `qn_local_${randomBytes(32).toString("base64url")}`;
    const refresh_token = `qn_refresh_${randomBytes(32).toString("base64url")}`;
    await this.store.saveAuthSession({
      access_hash: this.digest(token),
      refresh_hash: this.digest(refresh_token),
      user_id: userId,
      access_expires_at: new Date(Date.now() + 30 * 60000).toISOString(),
      refresh_expires_at: refreshExpiresAt,
      created_at: new Date().toISOString(),
    });
    return { token, refresh_token };
  }
  async register(dto: RegisterDto) {
    if (!dto.password || dto.password.length < 10 || dto.password.length > 128)
      throw new BadRequestException("Use a password with 10 to 128 characters");
    const fullName = dto.full_name.trim();
    if (
      !fullName ||
      fullName.length > 120 ||
      !["teacher", "student"].includes(dto.role)
    )
      throw new BadRequestException("Check your name and account role");
    const email = dto.email.trim().toLowerCase();
    const passwordHash = await LocalPassword.hash(dto.password);
    return this.store.transaction(async () => {
      if (await this.store.authEmailExists(email))
        throw new BadRequestException(
          "An account already uses this email. Please sign in.",
        );
      const profile: UserProfile = {
        id: randomUUID(),
        email,
        full_name: fullName,
        role: dto.role,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await this.store.put("profiles", profile);
      await this.store.saveAuthCredential(profile.id, passwordHash);
      return { ...(await this.session(profile.id)), profile };
    });
  }
  async login(dto: LoginDto) {
    if (!dto.password || dto.password.length > 128)
      throw new UnauthorizedException("Invalid email or password");
    const credential = await this.store.transaction(() =>
      this.store.authCredential(dto.email.trim().toLowerCase()),
    );
    const valid = await LocalPassword.verify(
      dto.password,
      credential?.passwordHash || "",
    );
    if (!valid || !credential)
      throw new UnauthorizedException("Invalid email or password");
    if (dto.role && credential.profile.role !== dto.role)
      throw new UnauthorizedException(
        "This account does not match the selected account type. Choose Teacher or Student and try again.",
      );
    return this.store.transaction(async () => ({
      ...(await this.session(credential.profile.id)),
      profile: credential.profile,
    }));
  }
  async authenticate(token: string): Promise<string | undefined> {
    if (!/^qn_local_[A-Za-z0-9_-]{43}$/.test(token)) return undefined;
    return this.store.transaction(async () => {
      const session = await this.store.authSession(
        "access",
        this.digest(token),
      );
      return session &&
        session.access_expires_at > new Date().toISOString() &&
        session.refresh_expires_at > new Date().toISOString()
        ? session.user_id
        : undefined;
    });
  }
  async refresh(token: string) {
    if (!/^qn_refresh_[A-Za-z0-9_-]{43}$/.test(token))
      throw new UnauthorizedException("Please sign in again");
    return this.store.transaction(async () => {
      const session = await this.store.authSession(
        "refresh",
        this.digest(token),
      );
      if (!session || session.refresh_expires_at <= new Date().toISOString())
        throw new UnauthorizedException("Please sign in again");
      await this.store.deleteAuthSession(session.access_hash);
      return this.session(session.user_id, session.refresh_expires_at);
    });
  }
  async logout(accessToken?: string, refreshToken?: string) {
    await this.store.transaction(() =>
      this.store.revokeAuthSessions(
        accessToken ? this.digest(accessToken) : "",
        refreshToken ? this.digest(refreshToken) : "",
      ),
    );
  }
}
