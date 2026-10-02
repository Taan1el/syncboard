/** Singular or plural form of a noun for a count: pluralize(2, 'card') is 'cards'. */
export function pluralize(count: number, singular: string, plural: string = `${singular}s`): string {
  return Math.abs(count) === 1 ? singular : plural;
}

/** "1 card", "2 cards". */
export function formatCount(count: number, singular: string, plural?: string): string {
  return `${count} ${pluralize(count, singular, plural)}`;
}

/** Up to two capital letters from a display name: "Mari Tamm" gives "MT", "karl" gives "K". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0].slice(0, 1);
  const last = parts.length > 1 ? parts[parts.length - 1].slice(0, 1) : '';
  return (first + last).toUpperCase();
}

/** HH:MM in UTC, so the feed reads the same for everyone on the board. */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--';
  return d.toISOString().slice(11, 16);
}
