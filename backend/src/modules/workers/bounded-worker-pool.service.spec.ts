import { BoundedWorkerPoolService } from './bounded-worker-pool.service';

describe('Bounded report workers', () => {
  it('runs CPU work outside the main thread and bounds concurrent tasks', async () => {
    const pool = new BoundedWorkerPoolService();
    try {
      const tasks = Array.from({ length: 10 }, (_, i) => pool.runTask(`task-${i}`, i, data => {
        const { isMainThread } = require('node:worker_threads');
        return { value: data * 2, isMainThread };
      }));
      expect(pool.busyWorkers).toBeLessThanOrEqual(4);
      expect(pool.queueLength).toBe(6);
      const results = await Promise.all(tasks);
      expect(results.map(r => r.value)).toEqual(Array.from({ length: 10 },(_,i) => i * 2));
      expect(results.every(r => !r.isMainThread)).toBe(true);
    } finally { pool.onModuleDestroy(); }
  });
  it('propagates errors without stalling subsequent work', async () => {
    const pool = new BoundedWorkerPoolService();
    try {
      await expect(pool.runTask('bad', null, () => { throw new Error('bad report'); })).rejects.toThrow('bad report');
      expect(await pool.runTask('good', 3, x => x + 1)).toBe(4);
    } finally { pool.onModuleDestroy(); }
  });
});
