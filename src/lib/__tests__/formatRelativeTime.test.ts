/* Tests for the relative-time formatter used by the profile voice card. */

import { formatRelativeTime } from '../formatRelativeTime';

const NOW = new Date('2026-05-12T12:00:00.000Z');

describe('formatRelativeTime', () => {
  it('returns "À l\'instant" for timestamps less than a minute old', () => {
    expect(formatRelativeTime('2026-05-12T11:59:30.000Z', NOW)).toBe("À l'instant");
    expect(formatRelativeTime('2026-05-12T12:00:00.000Z', NOW)).toBe("À l'instant");
  });

  it('clamps future timestamps (clock skew) to "À l\'instant"', () => {
    expect(formatRelativeTime('2026-05-12T12:00:30.000Z', NOW)).toBe("À l'instant");
  });

  it('formats minutes past', () => {
    expect(formatRelativeTime('2026-05-12T11:59:00.000Z', NOW)).toBe('Il y a 1 min');
    expect(formatRelativeTime('2026-05-12T11:55:00.000Z', NOW)).toBe('Il y a 5 min');
  });

  it('formats hours past', () => {
    expect(formatRelativeTime('2026-05-12T11:00:00.000Z', NOW)).toBe('Il y a 1 h');
    expect(formatRelativeTime('2026-05-12T05:00:00.000Z', NOW)).toBe('Il y a 7 h');
  });

  it('formats days past', () => {
    expect(formatRelativeTime('2026-05-11T12:00:00.000Z', NOW)).toBe('Il y a 1 j');
    expect(formatRelativeTime('2026-05-09T12:00:00.000Z', NOW)).toBe('Il y a 3 j');
  });

  it('formats weeks past', () => {
    expect(formatRelativeTime('2026-05-04T12:00:00.000Z', NOW)).toBe('Il y a 1 sem');
    expect(formatRelativeTime('2026-04-21T12:00:00.000Z', NOW)).toBe('Il y a 3 sem');
  });

  it('formats months past', () => {
    expect(formatRelativeTime('2026-03-12T12:00:00.000Z', NOW)).toBe('Il y a 2 mois');
  });

  it('returns an empty string for invalid ISO input', () => {
    expect(formatRelativeTime('not-a-date', NOW)).toBe('');
  });
});
