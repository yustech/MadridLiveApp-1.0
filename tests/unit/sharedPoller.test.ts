import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSharedPoller } from '../../src/utils/sharedPoller';

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('createSharedPoller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shares one fetch loop across multiple subscribers', async () => {
    const fetchItems = vi.fn()
      .mockResolvedValueOnce([{ id: 'a' }])
      .mockResolvedValueOnce([{ id: 'b' }]);
    const first = vi.fn();
    const second = vi.fn();

    const poller = createSharedPoller({
      fetchItems,
      intervalMs: 1000,
    });

    poller.subscribe(first);
    poller.subscribe(second);

    await flushPromises();

    expect(fetchItems).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledWith([{ id: 'a' }]);
    expect(second).toHaveBeenCalledWith([{ id: 'a' }]);

    await vi.advanceTimersByTimeAsync(1000);

    expect(fetchItems).toHaveBeenCalledTimes(2);
    expect(first).toHaveBeenLastCalledWith([{ id: 'b' }]);
    expect(second).toHaveBeenLastCalledWith([{ id: 'b' }]);
  });

  it('keeps notifying visible subscribers even when the payload is unchanged', async () => {
    const fetchItems = vi.fn().mockResolvedValue([{ id: 'same' }]);
    const callback = vi.fn();

    const poller = createSharedPoller({
      fetchItems,
      intervalMs: 1000,
    });

    poller.subscribe(callback);
    await flushPromises();
    await vi.advanceTimersByTimeAsync(1000);

    expect(fetchItems).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('pauses while hidden and refreshes immediately when visible again', async () => {
    let hidden = true;
    let visibilityListener = () => {};
    const removeVisibilityListener = vi.fn();
    const fetchItems = vi.fn().mockResolvedValue([{ id: 'visible' }]);
    const callback = vi.fn();

    const poller = createSharedPoller({
      fetchItems,
      intervalMs: 1000,
      visibility: {
        isPaused: () => hidden,
        onChange: (listener) => {
          visibilityListener = listener;
          return removeVisibilityListener;
        },
      },
    });

    const unsubscribe = poller.subscribe(callback);
    await flushPromises();

    expect(fetchItems).not.toHaveBeenCalled();

    hidden = false;
    visibilityListener();
    await flushPromises();

    expect(fetchItems).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith([{ id: 'visible' }]);

    unsubscribe();
    expect(removeVisibilityListener).toHaveBeenCalledTimes(1);
  });
});
