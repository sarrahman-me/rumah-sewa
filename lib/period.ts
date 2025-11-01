/**
 * Returns the current month as an ISO first-of-month date string.
 */
export function currentPeriodISO(): string {
  const d = new Date();
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const yyyy = first.getFullYear();
  const mm = String(first.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}-01`;
}

/**
 * Normalizes a YYYY-MM input to an ISO first-of-month date string.
 */
export function monthToISOFirst(value: string): string {
  if (!value) return currentPeriodISO();
  const [yyyy, mm] = value.split('-');
  if (!yyyy || !mm) return currentPeriodISO();
  return `${yyyy}-${mm}-01`;
}

/**
 * Converts an ISO date string to a YYYY-MM representation.
 */
export function isoToMonth(value: string): string {
  if (!value) return '';
  return value.slice(0, 7);
}
