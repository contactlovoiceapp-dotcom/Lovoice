/* Formats an ISO timestamp as a short French relative-time label (e.g. "Il y a 2 h"). */

export function formatRelativeTime(isoDate: string, now: Date = new Date()): string {
  const target = new Date(isoDate).getTime();
  if (Number.isNaN(target)) return '';

  const diffMs = now.getTime() - target;

  // Minor clock skew should not surface as "in the future" — clamp to "just now".
  if (diffMs < 60_000) return "À l'instant";

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `Il y a ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Il y a ${hours} h`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `Il y a ${days} j`;

  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `Il y a ${weeks} sem`;

  const months = Math.floor(days / 30);
  return `Il y a ${months} mois`;
}
