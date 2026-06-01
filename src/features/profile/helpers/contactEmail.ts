/* Validates the contact email collected before enqueueing a RGPD data-export request. */

export function normalizeContactEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidContactEmail(raw: string): boolean {
  const email = normalizeContactEmail(raw);
  if (email.length < 5 || email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
