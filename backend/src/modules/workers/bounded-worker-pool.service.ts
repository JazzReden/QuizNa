import { Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { Worker } from 'node:worker_threads';

interface Task<I, O> {
  id: string; data: I; source: string;
  resolve: (value: O) => void; reject: (reason: Error) => void;
}

/** Only trusted, self-contained server functions may be passed as handlers.
 * Authorization and DB access stay in services. Structured-cloned report data is
 * processed on up to four actual threads; the pending queue is capped at 100.
 */
@Injectable()
export class BoundedWorkerPoolService implements OnModuleDestroy {
  private readonly maxConcurrency = 4;
  private readonly maxQueueSize = 100;
  private queue: Task<unknown, unknown>[] = [];
  private active = new Map<Worker, Task<unknown, unknown>>();
  private stopped = false;
  get queueLength() { return this.queue.length; }
  get busyWorkers() { return this.active.size; }

  async runTask<I, O>(id: string, data: I, handler: (data: I) => Promise<O> | O): Promise<O> {
    if (this.stopped || this.queue.length >= this.maxQueueSize) throw new ServiceUnavailableException('Report processing is busy. Please retry.');
    return new Promise<O>((resolve, reject) => {
      this.queue.push({ id, data, source: handler.toString(), resolve, reject } as Task<unknown, unknown>);
      this.processNext();
    });
  }
  private processNext() {
    while (!this.stopped && this.active.size < this.maxConcurrency && this.queue.length) {
      const task = this.queue.shift()!;
      const worker = new Worker(`
        const { parentPort, workerData } = require('node:worker_threads');
        Promise.resolve().then(() => (0, eval)('(' + workerData.source + ')')(workerData.data))
          .then(result => parentPort.postMessage({ result }), error => parentPort.postMessage({ error: error.message }));
      `, { eval: true, workerData: { source: task.source, data: task.data } });
      this.active.set(worker, task);
      const timeout = setTimeout(() => finish(new Error('Report processing timed out')), 30000);
      const finish = (error?: Error, result?: unknown) => {
        if (!this.active.delete(worker)) return;
        clearTimeout(timeout);
        void worker.terminate();
        if (error) task.reject(error); else task.resolve(result);
        this.processNext();
      };
      worker.once('message', message => finish(message.error ? new Error(message.error) : undefined, message.result));
      worker.once('error', error => finish(error));
      worker.once('exit', code => { if (this.active.has(worker)) finish(new Error(`Report worker exited (${code})`)); });
    }
  }
  onModuleDestroy() {
    this.stopped = true;
    for (const task of this.queue.splice(0)) task.reject(new Error('Report service shutting down'));
    for (const [worker, task] of this.active) { task.reject(new Error('Report service shutting down')); void worker.terminate(); }
    this.active.clear();
  }
}
