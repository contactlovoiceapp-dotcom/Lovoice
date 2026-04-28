/* Tests for theme utility functions: hexToRgba and isHexLight. */

import { hexToRgba, isHexLight } from '../theme';

describe('hexToRgba', () => {
  it('converts a valid hex color with full opacity', () => {
    expect(hexToRgba('#ff0000', 1)).toBe('rgba(255,0,0,1)');
  });

  it('converts a valid hex color with partial opacity', () => {
    expect(hexToRgba('#00ff00', 0.5)).toBe('rgba(0,255,0,0.5)');
  });

  it('handles black', () => {
    expect(hexToRgba('#000000', 0.8)).toBe('rgba(0,0,0,0.8)');
  });

  it('handles white', () => {
    expect(hexToRgba('#ffffff', 1)).toBe('rgba(255,255,255,1)');
  });

  it('is case-insensitive', () => {
    expect(hexToRgba('#FF8800', 1)).toBe('rgba(255,136,0,1)');
  });

  it('throws on invalid hex input', () => {
    expect(() => hexToRgba('not-a-color', 1)).toThrow();
    expect(() => hexToRgba('#fff', 1)).toThrow();
    expect(() => hexToRgba('', 1)).toThrow();
  });
});

describe('isHexLight', () => {
  it('classifies white as light', () => {
    expect(isHexLight('#ffffff')).toBe(true);
  });

  it('classifies black as dark', () => {
    expect(isHexLight('#000000')).toBe(false);
  });

  it('classifies the chill theme top color (#c084fc) as light', () => {
    expect(isHexLight('#c084fc')).toBe(true);
  });

  it('classifies the electric theme top color (#e724ab) as dark', () => {
    expect(isHexLight('#e724ab')).toBe(false);
  });

  it('classifies the sunset theme top color (#fbbf24) as light', () => {
    expect(isHexLight('#fbbf24')).toBe(true);
  });

  it('classifies the midnight theme top color (#374151) as dark', () => {
    expect(isHexLight('#374151')).toBe(false);
  });
});
