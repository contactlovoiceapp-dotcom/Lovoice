/* Tests for formatVoiceOnlyCountdown — deterministic countdown arithmetic. */

import { formatVoiceOnlyCountdown } from '../types';

describe('formatVoiceOnlyCountdown', () => {
  it('computes hours and minutes when 1 hour remains', () => {
    const now = new Date('2026-05-24T10:00:00Z');
    const until = new Date('2026-05-24T11:00:00Z').toISOString();

    const result = formatVoiceOnlyCountdown(until, now);

    expect(result).toEqual({ hours: 1, minutes: 0, expired: false });
  });

  it('returns zero hours and minutes when exactly 0 seconds remain', () => {
    const now = new Date('2026-05-24T11:00:00Z');
    const until = new Date('2026-05-24T11:00:00Z').toISOString();

    const result = formatVoiceOnlyCountdown(until, now);

    expect(result).toEqual({ hours: 0, minutes: 0, expired: true });
  });

  it('returns expired when the target is in the past', () => {
    const now = new Date('2026-05-24T12:00:00Z');
    const until = new Date('2026-05-24T11:00:00Z').toISOString();

    const result = formatVoiceOnlyCountdown(until, now);

    expect(result).toEqual({ hours: 0, minutes: 0, expired: true });
  });

  it('handles partial-hour remainders correctly', () => {
    const now = new Date('2026-05-24T10:00:00Z');
    const until = new Date('2026-05-24T13:45:00Z').toISOString();

    const result = formatVoiceOnlyCountdown(until, now);

    expect(result).toEqual({ hours: 3, minutes: 45, expired: false });
  });
});
