/* Tests for the formatTime audio duration formatter. */

import { formatTime } from '../formatTime';

describe('formatTime', () => {
  it('formats zero seconds as 0:00', () => {
    expect(formatTime(0)).toBe('0:00');
  });

  it('formats seconds under a minute', () => {
    expect(formatTime(5)).toBe('0:05');
    expect(formatTime(30)).toBe('0:30');
    expect(formatTime(59)).toBe('0:59');
  });

  it('formats exact minutes', () => {
    expect(formatTime(60)).toBe('1:00');
    expect(formatTime(120)).toBe('2:00');
    expect(formatTime(300)).toBe('5:00');
  });

  it('formats minutes with seconds', () => {
    expect(formatTime(90)).toBe('1:30');
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(137)).toBe('2:17');
  });

  it('pads single-digit seconds with a leading zero', () => {
    expect(formatTime(61)).toBe('1:01');
    expect(formatTime(3)).toBe('0:03');
  });

  it('floors fractional seconds', () => {
    expect(formatTime(10.7)).toBe('0:10');
    expect(formatTime(90.999)).toBe('1:30');
  });
});
