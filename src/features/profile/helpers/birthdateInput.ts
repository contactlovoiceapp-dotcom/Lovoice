/* Birthdate input helpers keep the French UI format separate from the ISO date stored in profiles. */

export function formatBirthdateInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);

  return [day, month, year].filter(Boolean).join(' / ');
}

export function frenchBirthdateToIso(value: string): string | null {
  const digits = value.replace(/\D/g, '');

  if (digits.length !== 8) {
    return null;
  }

  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);

  return `${year}-${month}-${day}`;
}
