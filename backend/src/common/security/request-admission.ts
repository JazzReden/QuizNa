import type { Request, Response, NextFunction } from "express";

interface ClientBudget {
  start: number;
  count: number;
  burstStart: number;
  burst: number;
  active: number;
}
export interface AdmissionOptions {
  minuteLimit: number;
  burstLimit: number;
  maxActive: number;
  maxPerIp: number;
  maxUploads: number;
  maxClients: number;
}
const defaults: AdmissionOptions = {
  minuteLimit: 6000,
  burstLimit: 300,
  maxActive: 64,
  maxPerIp: 32,
  maxUploads: 4,
  maxClients: 10000,
};
/** A bounded, process-local admission layer before parsers, authentication and DB.
 * Endpoint-specific Nest throttles remain an independent, stricter second layer.
 * Classroom clients may share one public IP; this aggregate budget is deliberately
 * broader than the login, report, upload and quiz-code endpoint budgets.
 */
export class RequestAdmission {
  private clients = new Map<string, ClientBudget>();
  private active = 0;
  private uploads = 0;
  private requests = 0;
  private readonly limits: AdmissionOptions;
  constructor(
    options: Partial<AdmissionOptions> = {},
    private now = Date.now,
  ) {
    this.limits = { ...defaults, ...options };
  }
  readonly handle = (req: Request, res: Response, next: NextFunction) => {
    const reject = (status: number, message: string, retry?: number) => {
      if (retry) res.setHeader("Retry-After", String(retry));
      res.status(status).json({ statusCode: status, message });
    };
    if (req.originalUrl.length > 2048)
      return reject(414, "The request address is too long.");
    if ((req.headers.authorization?.length || 0) > 8192)
      return reject(431, "The request header is too large.");
    const now = this.now();
    if (
      ++this.requests % 256 === 0 ||
      this.clients.size >= this.limits.maxClients
    )
      for (const [key, budget] of this.clients)
        if (!budget.active && now - budget.start >= 60000)
          this.clients.delete(key);
    // req.ip respects Express's explicitly configured trusted proxy chain.
    // Never trust a raw X-Forwarded-For/CF-Connecting-IP value here.
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    let budget = this.clients.get(ip);
    if (!budget) {
      if (this.clients.size >= this.limits.maxClients)
        return reject(503, "The service is busy. Please retry shortly.", 10);
      budget = { start: now, count: 0, burstStart: now, burst: 0, active: 0 };
      this.clients.set(ip, budget);
    }
    if (now - budget.start >= 60000) {
      budget.start = now;
      budget.count = 0;
    }
    if (now - budget.burstStart >= 10000) {
      budget.burstStart = now;
      budget.burst = 0;
    }
    if (
      budget.count >= this.limits.minuteLimit ||
      budget.burst >= this.limits.burstLimit
    )
      return reject(
        429,
        "Too many requests. Please retry shortly.",
        budget.count >= this.limits.minuteLimit
          ? Math.max(1, Math.ceil((budget.start + 60000 - now) / 1000))
          : 10,
      );
    const upload =
      req.headers["content-type"]?.startsWith("multipart/form-data") || false;
    if (upload && Number(req.headers["content-length"]) > 6 * 1024 * 1024)
      return reject(413, "The uploaded images are too large.");
    if (
      this.active >= this.limits.maxActive ||
      budget.active >= this.limits.maxPerIp ||
      (upload && this.uploads >= this.limits.maxUploads)
    )
      return reject(503, "The service is busy. Please retry shortly.", 2);
    budget.count++;
    budget.burst++;
    budget.active++;
    this.active++;
    if (upload) this.uploads++;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      budget!.active--;
      this.active--;
      if (upload) this.uploads--;
    };
    res.once("finish", release);
    res.once("close", release);
    next();
  };
}
