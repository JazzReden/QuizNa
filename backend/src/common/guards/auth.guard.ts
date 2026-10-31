import { AccountBudget } from "../security/account-budget";
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { DatabaseService } from "../../database/database.service";

@Injectable()
export class AuthGuard implements CanActivate {
  private static readonly budget = new AccountBudget();
  constructor(private db: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header = request.headers.authorization;
    if (typeof header !== "string" || !header.startsWith("Bearer ")) {
      throw new UnauthorizedException("Please sign in");
    }
    const token = header.slice(7);
    let userId: string | undefined;
    if (this.db.isDemo) {
      const demos: Record<string, string> = {
        "teacher-token": "a0000000-0000-0000-0000-000000000001",
        "student-token": "b0000000-0000-0000-0000-000000000002",
        "student2-token": "b0000000-0000-0000-0000-000000000003",
      };
      userId = this.db.isMysql
        ? await this.db.localAuth.authenticate(token)
        : demos[token];
    } else {
      const { data, error } = await this.db.client!.auth.getUser(token);
      if (error || !data.user)
        throw new UnauthorizedException(
          "Session expired. Please sign in again",
        );
      userId = data.user.id;
    }
    if (!userId) throw new UnauthorizedException("Invalid credentials");
    AuthGuard.budget.check(userId);
    const profile = await this.db.getProfile(userId);
    if (!profile)
      throw new UnauthorizedException("Account profile unavailable");
    request.user = profile;
    return true;
  }
}
