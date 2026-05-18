// Computes a calendar-year age from an ISO birthdate string; returns 0 for invalid input.

export function ageFromBirthdate(isoDate: string): number {
  const birth = new Date(isoDate);
  if (Number.isNaN(birth.getTime())) return 0;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDelta = now.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < birth.getDate())) {
    age -= 1;
  }
  return Math.max(0, age);
}
