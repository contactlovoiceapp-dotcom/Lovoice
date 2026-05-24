/* Tests for chatMessagePlayer — deterministic bar height generation. */

import { generateBarHeights } from '../chatMessagePlayer';

describe('generateBarHeights', () => {
  it('returns the requested number of bars', () => {
    const bars = generateBarHeights('msg-abc-123', 28);
    expect(bars).toHaveLength(28);
  });

  it('produces deterministic output for the same seed', () => {
    const a = generateBarHeights('seed-xyz', 20);
    const b = generateBarHeights('seed-xyz', 20);
    expect(a).toEqual(b);
  });

  it('produces different output for different seeds', () => {
    const a = generateBarHeights('seed-1', 20);
    const b = generateBarHeights('seed-2', 20);
    expect(a).not.toEqual(b);
  });

  it('all values are bounded between 0.2 and 1.0', () => {
    const bars = generateBarHeights('bounds-test', 100);
    for (const h of bars) {
      expect(h).toBeGreaterThanOrEqual(0.2);
      expect(h).toBeLessThanOrEqual(1.0);
    }
  });

  it('handles empty seed gracefully', () => {
    const bars = generateBarHeights('', 10);
    expect(bars).toHaveLength(10);
    for (const h of bars) {
      expect(h).toBeGreaterThanOrEqual(0.2);
      expect(h).toBeLessThanOrEqual(1.0);
    }
  });
});
