export function currentPeriodISO(): string {
  const d = new Date();
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const yyyy = first.getFullYear();
  const mm = String(first.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}-01`;
}

export function monthToISOFirst(value: string): string {
  if (!value) return currentPeriodISO();
  const [yyyy, mm] = value.split("-");
  if (!yyyy || !mm) return currentPeriodISO();
  return `${yyyy}-${mm}-01`;
}

export function isoToMonth(value: string): string {
  if (!value) return "";
  return value.slice(0, 7);
}
