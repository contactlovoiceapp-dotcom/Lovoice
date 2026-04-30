/* Unit tests for profile field validators — covers all acceptance criteria from Phase 3. */

import {
  validateDisplayName,
  validateAge,
  validateGender,
  validateLookingFor,
} from '../validation';

describe('validateDisplayName', () => {
  it('accepts a name at the minimum length (2)', () => {
    expect(validateDisplayName('Al')).toEqual({ valid: true });
  });

  it('accepts a name at the maximum length (30)', () => {
    expect(validateDisplayName('A'.repeat(30))).toEqual({ valid: true });
  });

  it('accepts a typical name', () => {
    expect(validateDisplayName('Alice')).toEqual({ valid: true });
  });

  it('rejects an empty string', () => {
    expect(validateDisplayName('')).toEqual({ valid: false, error: 'too_short' });
  });

  it('rejects a single character', () => {
    expect(validateDisplayName('A')).toEqual({ valid: false, error: 'too_short' });
  });

  it('trims whitespace before measuring length', () => {
    expect(validateDisplayName('  A  ')).toEqual({ valid: false, error: 'too_short' });
  });

  it('rejects a name of 31 characters', () => {
    expect(validateDisplayName('A'.repeat(31))).toEqual({ valid: false, error: 'too_long' });
  });
});

describe('validateAge', () => {
  // Builds a YYYY-MM-DD string in local time to avoid UTC vs timezone confusion.
  // toISOString() would shift the date when the local offset is non-zero.
  function birthdateYearsAgo(years: number, offsetDays = 0): string {
    const today = new Date();
    const bd = new Date(today.getFullYear() - years, today.getMonth(), today.getDate() + offsetDays);
    const y = bd.getFullYear();
    const m = String(bd.getMonth() + 1).padStart(2, '0');
    const d = String(bd.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  it('accepts exactly 18 years old (birthday today)', () => {
    expect(validateAge(birthdateYearsAgo(18))).toEqual({ valid: true });
  });

  it('accepts someone well over 18', () => {
    expect(validateAge(birthdateYearsAgo(25))).toEqual({ valid: true });
  });

  it('rejects someone whose 18th birthday is tomorrow', () => {
    // +1 day means they will turn 18 in 1 day — still 17 today.
    expect(validateAge(birthdateYearsAgo(18, 1))).toEqual({ valid: false, error: 'underage' });
  });

  it('rejects someone clearly under 18', () => {
    expect(validateAge(birthdateYearsAgo(16))).toEqual({ valid: false, error: 'underage' });
  });

  it('rejects a non-date string', () => {
    expect(validateAge('not-a-date')).toEqual({ valid: false, error: 'invalid_date' });
  });

  it('rejects an empty string', () => {
    expect(validateAge('')).toEqual({ valid: false, error: 'invalid_date' });
  });
});

describe('validateGender', () => {
  it.each(['male', 'female', 'nonbinary', 'other'])('accepts "%s"', (gender) => {
    expect(validateGender(gender)).toEqual({ valid: true });
  });

  it('rejects an unsupported value', () => {
    expect(validateGender('unknown')).toEqual({ valid: false, error: 'invalid' });
  });

  it('rejects an empty string', () => {
    expect(validateGender('')).toEqual({ valid: false, error: 'invalid' });
  });

  it('is case-sensitive — rejects "Male"', () => {
    expect(validateGender('Male')).toEqual({ valid: false, error: 'invalid' });
  });
});

describe('validateLookingFor', () => {
  it('accepts a single valid gender', () => {
    expect(validateLookingFor(['female'])).toEqual({ valid: true });
  });

  it('accepts multiple valid genders', () => {
    expect(validateLookingFor(['male', 'nonbinary'])).toEqual({ valid: true });
  });

  it('accepts all four genders at once', () => {
    expect(validateLookingFor(['male', 'female', 'nonbinary', 'other'])).toEqual({ valid: true });
  });

  it('rejects an empty array', () => {
    expect(validateLookingFor([])).toEqual({ valid: false, error: 'empty' });
  });

  it('rejects an array containing an invalid value', () => {
    expect(validateLookingFor(['female', 'alien'])).toEqual({
      valid: false,
      error: 'invalid_value',
    });
  });

  it('rejects an array of only invalid values', () => {
    expect(validateLookingFor(['alien', 'robot'])).toEqual({
      valid: false,
      error: 'invalid_value',
    });
  });
});
