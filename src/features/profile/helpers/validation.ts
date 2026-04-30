/* Pure profile field validators — mirrors the server-side trigger constraints so errors surface client-side first.
   Error codes map to French messages in COPY.onboarding.<step>.errors. */

export const GENDER_VALUES = ['male', 'female', 'nonbinary', 'other'] as const;
export type GenderValue = (typeof GENDER_VALUES)[number];

const DISPLAY_NAME_MIN = 2;
const DISPLAY_NAME_MAX = 30;
const AGE_MINIMUM = 18;

export type DisplayNameError = 'too_short' | 'too_long';
export type BirthdateError = 'invalid_date' | 'underage';
export type GenderError = 'invalid';
export type LookingForError = 'empty' | 'invalid_value';

export type ValidationResult<E extends string = string> =
  | { valid: true }
  | { valid: false; error: E };

export function validateDisplayName(name: string): ValidationResult<DisplayNameError> {
  const trimmed = name.trim();
  if (trimmed.length < DISPLAY_NAME_MIN) return { valid: false, error: 'too_short' };
  if (trimmed.length > DISPLAY_NAME_MAX) return { valid: false, error: 'too_long' };
  return { valid: true };
}

export function validateAge(birthdate: string): ValidationResult<BirthdateError> {
  // Parse YYYY-MM-DD components directly to avoid UTC vs local-timezone confusion.
  // new Date("YYYY-MM-DD") is parsed as UTC midnight, but getDate() uses local time.
  const parts = birthdate.split('-');
  if (parts.length !== 3) return { valid: false, error: 'invalid_date' };

  const year = parseInt(parts[0] ?? '', 10);
  const month = parseInt(parts[1] ?? '', 10) - 1; // 0-indexed
  const day = parseInt(parts[2] ?? '', 10);

  if (isNaN(year) || isNaN(month) || isNaN(day)) return { valid: false, error: 'invalid_date' };

  // Verify the date actually exists (rejects e.g. Feb 30).
  const verified = new Date(year, month, day);
  if (
    verified.getFullYear() !== year ||
    verified.getMonth() !== month ||
    verified.getDate() !== day
  ) {
    return { valid: false, error: 'invalid_date' };
  }

  const today = new Date();
  let age = today.getFullYear() - year;
  const monthDiff = today.getMonth() - month;

  // Adjust if the birthday hasn't occurred yet this year.
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < day)) {
    age -= 1;
  }

  if (age < AGE_MINIMUM) return { valid: false, error: 'underage' };
  return { valid: true };
}

export function validateGender(gender: string): ValidationResult<GenderError> {
  if (!GENDER_VALUES.includes(gender as GenderValue)) {
    return { valid: false, error: 'invalid' };
  }
  return { valid: true };
}

export function validateLookingFor(lookingFor: string[]): ValidationResult<LookingForError> {
  if (lookingFor.length === 0) return { valid: false, error: 'empty' };
  if (!lookingFor.every((v) => GENDER_VALUES.includes(v as GenderValue))) {
    return { valid: false, error: 'invalid_value' };
  }
  return { valid: true };
}
