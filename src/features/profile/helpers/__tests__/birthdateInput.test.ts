/* Tests for French birthdate input formatting and ISO conversion used by onboarding. */

import { formatBirthdateInput, frenchBirthdateToIso } from '../birthdateInput';

describe('formatBirthdateInput', () => {
  it('formats numeric input as JJ / MM / AAAA', () => {
    expect(formatBirthdateInput('01021995')).toBe('01 / 02 / 1995');
  });

  it('removes non-digit characters and caps input length', () => {
    expect(formatBirthdateInput('01abc02199599')).toBe('01 / 02 / 1995');
  });
});

describe('frenchBirthdateToIso', () => {
  it('converts a complete French date input to ISO format', () => {
    expect(frenchBirthdateToIso('01 / 02 / 1995')).toBe('1995-02-01');
  });

  it('returns null for incomplete dates', () => {
    expect(frenchBirthdateToIso('01 / 02')).toBeNull();
  });
});

describe('isoBirthdateToFrench', () => {
  it('converts an ISO date to the French display format', () => {
    const { isoBirthdateToFrench } = require('../birthdateInput');
    expect(isoBirthdateToFrench('1995-02-01')).toBe('01 / 02 / 1995');
  });
});
