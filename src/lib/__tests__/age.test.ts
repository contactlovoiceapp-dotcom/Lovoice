/* Tests for ageFromBirthdate: 25-year-old, invalid input, and pre/post-birthday boundary. */

import { ageFromBirthdate } from '../age';

describe('ageFromBirthdate', () => {
  it('returns the calendar age for a date 25 years ago', () => {
    const now = new Date();
    const iso = new Date(now.getFullYear() - 25, now.getMonth(), now.getDate()).toISOString();
    expect(ageFromBirthdate(iso)).toBe(25);
  });

  it('returns 0 for an unparseable string', () => {
    expect(ageFromBirthdate('not-a-date')).toBe(0);
  });

  it('returns N-1 the day before a birthday and N the day after', () => {
    const now = new Date();
    // Yesterday's birth (same year - 30) means the birthday is tomorrow → still 29.
    const tomorrow = new Date(now.getFullYear() - 30, now.getMonth(), now.getDate() + 1);
    // Yesterday's birthday means the user has already turned 30.
    const yesterday = new Date(now.getFullYear() - 30, now.getMonth(), now.getDate() - 1);
    expect(ageFromBirthdate(tomorrow.toISOString())).toBe(29);
    expect(ageFromBirthdate(yesterday.toISOString())).toBe(30);
  });
});
