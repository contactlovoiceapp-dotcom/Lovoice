/* Tests for phone country detection and E.164 formatting helpers. */

import {
  formatPhoneAsE164,
  getCountryFromE164Phone,
  isE164Phone,
  isSupportedE164Phone,
  SUPPORTED_PHONE_COUNTRIES,
} from '../country';

describe('phone country helpers', () => {
  it('lists only France, Belgium, and Switzerland as supported countries', () => {
    expect(SUPPORTED_PHONE_COUNTRIES.map(({ country }) => country)).toEqual([
      'FR',
      'BE',
      'CH',
    ]);
  });

  it('detects countries from supported E.164 phone prefixes', () => {
    expect(getCountryFromE164Phone('+33612345678')).toBe('FR');
    expect(getCountryFromE164Phone('+32470123456')).toBe('BE');
    expect(getCountryFromE164Phone('+41781234567')).toBe('CH');
  });

  it('accepts common separators before country detection', () => {
    expect(getCountryFromE164Phone('+33 6 12 34 56 78')).toBe('FR');
    expect(getCountryFromE164Phone('0032 470 12 34 56')).toBe('BE');
    expect(getCountryFromE164Phone('+41 (78) 123 45 67')).toBe('CH');
  });

  it('rejects unsupported country prefixes', () => {
    expect(getCountryFromE164Phone('+14155550123')).toBeNull();
    expect(isSupportedE164Phone('+14155550123')).toBe(false);
  });

  it('rejects invalid E.164 phone numbers', () => {
    expect(isE164Phone('')).toBe(false);
    expect(isE164Phone('+33123')).toBe(false);
    expect(isE164Phone('+330000000000000000')).toBe(false);
    expect(getCountryFromE164Phone('612345678')).toBeNull();
  });

  it('formats national phone numbers as E.164 for the selected country', () => {
    expect(formatPhoneAsE164('06 12 34 56 78', '+33')).toBe('+33612345678');
    expect(formatPhoneAsE164('0470 12 34 56', '+32')).toBe('+32470123456');
    expect(formatPhoneAsE164('078 123 45 67', '+41')).toBe('+41781234567');
  });

  it('preserves valid international inputs when formatting', () => {
    expect(formatPhoneAsE164('+33 6 12 34 56 78', '+33')).toBe('+33612345678');
    expect(formatPhoneAsE164('33612345678', '+33')).toBe('+33612345678');
    expect(formatPhoneAsE164('0033 6 12 34 56 78', '+33')).toBe('+33612345678');
  });

  it('returns null when formatted output is invalid or unsupported', () => {
    expect(formatPhoneAsE164('123', '+33')).toBeNull();
    expect(formatPhoneAsE164('+1 415 555 0123', '+33')).toBeNull();
    expect(formatPhoneAsE164('+32 470 12 34 56', '+33')).toBeNull();
  });
});
