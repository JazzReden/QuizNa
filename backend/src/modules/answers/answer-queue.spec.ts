import { AnswerQueue } from '../../../../frontend/src/utils/answerQueue';

describe('Student save queue', () => {
  afterEach(() => jest.useRealTimers());
  it('debounces changes and sends only the latest value', async () => {
    jest.useFakeTimers();
    const send = jest.fn().mockResolvedValue(undefined);
    const queue = new AnswerQueue(send, () => {});
    queue.enqueue('q1', 'a'); queue.enqueue('q1', 'ab'); queue.enqueue('q1', 'abc');
    expect(send).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(600);
    expect(send.mock.calls).toEqual([['q1','abc']]);
    expect(queue.size).toBe(0); queue.stop();
  });
  it('never acknowledges a newer edit when an older request completes', async () => {
    jest.useFakeTimers();
    let finish!: () => void;
    const send = jest.fn().mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; })).mockResolvedValue(undefined);
    const queue = new AnswerQueue(send, () => {});
    queue.enqueue('q1','first'); const flushing = queue.flush();
    queue.enqueue('q1','second'); finish();
    await flushing;
    expect(send.mock.calls).toEqual([['q1','first'],['q1','second']]); queue.stop();
  });
  it('retains failed saves, retries safely, and recovers pending work after refresh', async () => {
    jest.useFakeTimers();
    let draft: [string,string | null][] = [];
    const send = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const status = jest.fn();
    const queue = new AnswerQueue(send,status, entries => { draft = entries; });
    queue.enqueue('q1','latest'); expect(await queue.flush()).toBe(false);
    expect(draft).toEqual([['q1','latest']]); expect(status).toHaveBeenLastCalledWith('error');
    queue.stop();
    const restored = new AnswerQueue(send,status, entries => { draft = entries; });
    restored.restore(draft); expect(await restored.flush()).toBe(true);
    expect(draft).toEqual([]); expect(status).toHaveBeenLastCalledWith('saved'); restored.stop();
  });
  it('flushes all pending questions before submission and prevents writes after stop', async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    const queue = new AnswerQueue(send, () => {});
    queue.enqueue('q1','one'); queue.enqueue('q2','two');
    expect(await queue.flush()).toBe(true); expect(send).toHaveBeenCalledTimes(2);
    queue.stop(true); queue.enqueue('q1','too late'); expect(queue.size).toBe(0);
  });
});
