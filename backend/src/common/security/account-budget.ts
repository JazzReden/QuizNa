import {
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from "@nestjs/common";
/** Shared by all AuthGuard instances. Key only by a verified server identity. */
export class AccountBudget {
  private entries = new Map<string, { expires: number; count: number }>();
  constructor(
    private limit = 240,
    private maxAccounts = 10000,
    private now = Date.now,
  ) {}
  check(userId: string) {
    const now = this.now();
    if (this.entries.size >= this.maxAccounts)
      for (const [id, entry] of this.entries)
        if (entry.expires <= now) this.entries.delete(id);
    let entry = this.entries.get(userId);
    if (!entry || entry.expires <= now) {
      if (!entry && this.entries.size >= this.maxAccounts)
        throw new ServiceUnavailableException("Please retry shortly.");
      entry = { count: 0, expires: now + 60000 };
      this.entries.set(userId, entry);
    }
    if (entry.count >= this.limit)
      throw new HttpException(
        "Too many requests. Please wait a minute and try again.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    entry.count++;
  }
}
