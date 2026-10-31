import { BoundedWork } from "../../common/security/bounded-work";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/** Versioned, salted scrypt hashes; all CPU work is asynchronous. */
export class LocalPassword {
  private static readonly work = new BoundedWork(2, 12);
  private static derive(password: string, salt: string): Promise<Buffer> {
    return this.work.run(
      () =>
        new Promise<Buffer>((resolve, reject) =>
          scrypt(
            password,
            salt,
            64,
            { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
            (error, key) => (error ? reject(error) : resolve(key)),
          ),
        ),
    );
  }
  static async hash(password: string): Promise<string> {
    const salt = randomBytes(16).toString("hex");
    const key = await this.derive(password, salt);
    return `scrypt$32768$8$1$${salt}$${key.toString("hex")}`;
  }
  static async verify(password: string, encoded: string): Promise<boolean> {
    const match = /^scrypt\$32768\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(
      encoded,
    );
    // Unknown accounts still perform the same expensive password operation.
    const key = await this.derive(password, match?.[1] || "0".repeat(32));
    const expected = Buffer.from(match?.[2] || "0".repeat(128), "hex");
    return timingSafeEqual(key, expected) && !!match;
  }
}
