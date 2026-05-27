// Time-based throttle: returns true at most once per `intervalMs`, false otherwise.
// flush() resets the timer so the next ping always fires immediately.
export interface Throttle {
  ping: () => boolean;
  flush: () => void;
}

export function createThrottle(intervalMs: number): Throttle {
  let lastFiredAt = 0;

  return {
    ping(): boolean {
      const now = Date.now();
      if (now - lastFiredAt >= intervalMs) {
        lastFiredAt = now;
        return true;
      }
      return false;
    },
    flush(): void {
      lastFiredAt = 0;
    },
  };
}

// Trailing-edge debounce: each schedule() resets a single pending timer; the
// callback fires once `delayMs` after the most recent schedule() call.
// Used to collapse bursty Realtime invalidations into a single refetch.
export interface Debouncer {
  schedule: () => void;
  cancel: () => void;
}

export function createDebouncer(fn: () => void, delayMs: number): Debouncer {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return {
    schedule(): void {
      if (timeoutId !== null) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        timeoutId = null;
        fn();
      }, delayMs);
    },
    cancel(): void {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    },
  };
}
