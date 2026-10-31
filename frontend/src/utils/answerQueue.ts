/** One request at a time preserves answer order, including retries after reconnect. */
export class AnswerQueue {
  private pending = new Map<string, { value: string | null; revision: number }>();
  private revision = 0;
  private running: Promise<boolean> | null = null;
  private timer?: ReturnType<typeof setTimeout>;
  private failures = 0;
  private closed = false;
  constructor(
    private send: (questionId: string, value: string | null) => Promise<void>,
    private status: (state: 'saving' | 'saved' | 'error') => void,
    private persist: (entries: [string, string | null][]) => void = () => {},
  ) {}
  get size() { return this.pending.size; }
  restore(entries: [string, string | null][]) {
    for (const [id, value] of entries) this.pending.set(id, { value, revision: ++this.revision });
    if (this.size) this.schedule(0);
  }
  enqueue(id: string, value: string | null) {
    if (this.closed) return;
    this.pending.set(id, { value, revision: ++this.revision });
    this.store();
    this.status('saving');
    this.schedule(600);
  }
  private store() { this.persist([...this.pending].map(([id, item]) => [id, item.value])); }
  private schedule(delay: number) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), delay);
  }
  async flush(): Promise<boolean> {
    clearTimeout(this.timer);
    if (this.running) return this.running;
    if (this.closed) return false;
    this.running = this.drain();
    try { return await this.running; }
    finally { this.running = null; }
  }
  private async drain(): Promise<boolean> {
    while (this.pending.size && !this.closed) {
      const [id, item] = this.pending.entries().next().value!;
      this.status('saving');
      try {
        await this.send(id, item.value);
        if (this.pending.get(id)?.revision === item.revision) this.pending.delete(id);
        this.failures = 0;
        this.store();
      } catch {
        this.status('error');
        this.schedule(Math.min(15000, 1000 * 2 ** Math.min(this.failures++, 4)));
        return false;
      }
    }
    if (!this.closed) this.status('saved');
    return !this.closed;
  }
  stop(clear = false) {
    this.closed = true;
    clearTimeout(this.timer);
    if (clear) { this.pending.clear(); this.store(); }
  }
}
