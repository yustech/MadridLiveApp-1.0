type Subscriber<T> = (items: T[]) => void;
type Unsubscribe = () => void;

interface VisibilityController {
  isPaused: () => boolean;
  onChange: (listener: () => void) => Unsubscribe;
}

interface SharedPollerOptions<T> {
  fetchItems: () => Promise<T[]>;
  intervalMs: number;
  visibility?: VisibilityController;
  onError?: (error: unknown) => void;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}

export interface SharedPoller<T> {
  subscribe: (callback: Subscriber<T>) => Unsubscribe;
  refresh: () => void;
  getSubscriberCount: () => number;
}

export function createDocumentVisibilityController(
  documentRef: Document | undefined = typeof document === 'undefined' ? undefined : document
): VisibilityController {
  return {
    isPaused: () => Boolean(documentRef?.hidden),
    onChange: (listener) => {
      if (!documentRef) return () => {};

      documentRef.addEventListener('visibilitychange', listener);
      return () => documentRef.removeEventListener('visibilitychange', listener);
    },
  };
}

export function createSharedPoller<T>({
  fetchItems,
  intervalMs,
  visibility = createDocumentVisibilityController(),
  onError,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
}: SharedPollerOptions<T>): SharedPoller<T> {
  const subscribers = new Set<Subscriber<T>>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let removeVisibilityListener: Unsubscribe | null = null;
  let isLoading = false;
  let lastItems: T[] | null = null;

  const clearTimer = () => {
    if (!timer) return;
    clearTimeoutFn(timer);
    timer = null;
  };

  const notify = (items: T[]) => {
    subscribers.forEach((callback) => callback(items));
  };

  const stop = () => {
    clearTimer();
    removeVisibilityListener?.();
    removeVisibilityListener = null;
    isLoading = false;
    lastItems = null;
  };

  const scheduleNext = () => {
    clearTimer();
    if (subscribers.size === 0 || visibility.isPaused()) return;

    timer = setTimeoutFn(() => {
      void load();
    }, intervalMs);
  };

  const load = async () => {
    if (subscribers.size === 0 || visibility.isPaused() || isLoading) {
      scheduleNext();
      return;
    }

    isLoading = true;
    try {
      const items = await fetchItems();
      lastItems = items;
      notify(items);
    } catch (error) {
      onError?.(error);
    } finally {
      isLoading = false;
      scheduleNext();
    }
  };

  const handleVisibilityChange = () => {
    clearTimer();
    if (subscribers.size === 0 || visibility.isPaused()) return;
    void load();
  };

  return {
    subscribe(callback) {
      subscribers.add(callback);
      if (lastItems) callback(lastItems);

      if (subscribers.size === 1) {
        removeVisibilityListener = visibility.onChange(handleVisibilityChange);
        void load();
      }

      return () => {
        subscribers.delete(callback);
        if (subscribers.size === 0) stop();
      };
    },
    refresh() {
      clearTimer();
      void load();
    },
    getSubscriberCount() {
      return subscribers.size;
    },
  };
}
