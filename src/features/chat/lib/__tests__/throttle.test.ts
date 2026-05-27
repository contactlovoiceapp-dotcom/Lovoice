// Tests for the time-based throttle and trailing-edge debouncer helpers.
import { createDebouncer, createThrottle } from '../throttle';

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

describe('createDebouncer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('fires once after delayMs of silence', () => {
    const fn = jest.fn();
    const d = createDebouncer(fn, 500);

    d.schedule();
    expect(fn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(499);
    expect(fn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('collapses a burst of schedule() calls into a single fire', () => {
    const fn = jest.fn();
    const d = createDebouncer(fn, 500);

    d.schedule();
    jest.advanceTimersByTime(100);
    d.schedule();
    jest.advanceTimersByTime(100);
    d.schedule();
    jest.advanceTimersByTime(100);
    d.schedule();

    // Only the last schedule() arms the live timer.
    expect(fn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('cancel() prevents a pending fire', () => {
    const fn = jest.fn();
    const d = createDebouncer(fn, 500);

    d.schedule();
    jest.advanceTimersByTime(200);
    d.cancel();
    jest.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });

  it('can be re-armed after a fire', () => {
    const fn = jest.fn();
    const d = createDebouncer(fn, 500);

    d.schedule();
    jest.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledTimes(1);

    d.schedule();
    jest.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
