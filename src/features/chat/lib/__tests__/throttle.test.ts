// Tests for the time-based throttle helper.
import { createThrottle } from '../throttle';

describe('createThrottle', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns true on the first ping', () => {
    const t = createThrottle(3000);
    expect(t.ping()).toBe(true);
  });

  it('returns false when called again within the interval', () => {
    const t = createThrottle(3000);
    t.ping(); // fires
    jest.advanceTimersByTime(1000);
    expect(t.ping()).toBe(false);
  });

  it('returns true again after the interval has elapsed', () => {
    const t = createThrottle(3000);
    t.ping();
    jest.advanceTimersByTime(3000);
    expect(t.ping()).toBe(true);
  });

  it('returns true on the exact boundary', () => {
    const t = createThrottle(1000);
    t.ping();
    jest.advanceTimersByTime(1000);
    expect(t.ping()).toBe(true);
  });

  it('flush() resets the timer so the next ping fires immediately', () => {
    const t = createThrottle(3000);
    t.ping();
    jest.advanceTimersByTime(500);
    t.flush();
    expect(t.ping()).toBe(true);
  });

  it('independently throttles multiple pings', () => {
    const t = createThrottle(3000);
    expect(t.ping()).toBe(true);
    expect(t.ping()).toBe(false);
    expect(t.ping()).toBe(false);
    jest.advanceTimersByTime(3001);
    expect(t.ping()).toBe(true);
    expect(t.ping()).toBe(false);
  });
});
