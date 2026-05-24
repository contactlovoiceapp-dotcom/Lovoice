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
