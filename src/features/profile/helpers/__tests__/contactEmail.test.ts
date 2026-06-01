/* Tests for contact email validation on data-export requests. */

import { isValidContactEmail, normalizeContactEmail } from '../contactEmail';

describe('contactEmail', () => {
  it('normalizes to lowercase trimmed', () => {
    expect(normalizeContactEmail('  Alice@Mail.COM ')).toBe('alice@mail.com');
  });

  it('accepts a standard email', () => {
    expect(isValidContactEmail('user@example.com')).toBe(true);
  });

  it('rejects missing or malformed addresses', () => {
    expect(isValidContactEmail('')).toBe(false);
    expect(isValidContactEmail('not-an-email')).toBe(false);
    expect(isValidContactEmail('a@b')).toBe(false);
  });
});
