import { ServiceUnavailableException } from "@nestjs/common";
/** Bound both executing work and its waiting queue; no database locks held here. */
export class BoundedWork {
  private active = 0;
  private waiting: (() => void)[] = [];
  constructor(
    private concurrency: number,
    private maxWaiting: number,
  ) {}
  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.active >= this.concurrency) {
      if (this.waiting.length >= this.maxWaiting)
        throw new ServiceUnavailableException(
          "Sign-in is busy. Please retry shortly.",
        );
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    } else this.active++;
    try {
      return await work();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active--;
    }
  }
}
