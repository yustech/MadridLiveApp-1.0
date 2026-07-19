import { afterEach, describe, expect, it, vi } from 'vitest';
import { performWorkerCheckOut } from '../../server/mysql/lifecycle/workerLifecycle';

describe('worker checkout legacy duration label', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores two decimal hours while canonical timestamps remain authoritative', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-19T12:14:33.000Z'));

    const query = vi.fn()
      .mockResolvedValueOnce([[{ id: 'worker-duration', totalHours: 0 }]])
      .mockResolvedValueOnce([[{
        id: 'shift-duration',
        timespan: '10:00 - Present',
        startedAt: '2026-07-19T10:00:00.000Z',
      }]])
      .mockResolvedValueOnce([[{ id: 'worker-duration', status: 'OUT' }]])
      .mockResolvedValueOnce([[{ id: 'shift-duration', status: 'Completed' }]]);
    const execute = vi.fn().mockResolvedValue([{ affectedRows: 1 }]);

    await performWorkerCheckOut({ query, execute }, { workerId: 'worker-duration' });

    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[0][1][1]).toBe('2.24h');
  });
});
