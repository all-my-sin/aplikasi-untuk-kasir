/** Calendar parts of `date` in the given IANA time zone. */
function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { year: get('year'), month: get('month'), day: get('day') };
}

/** "YYYYMMDD" for a moment in the store time zone (used in transaction numbers). */
export function dateKey(date: Date, timeZone: string): string {
  const { year, month, day } = zonedParts(date, timeZone);
  return `${year}${month}${day}`;
}

/** "YYYY-MM-DD" for a moment in a time zone. */
export function isoDay(date: Date, timeZone: string): string {
  const { year, month, day } = zonedParts(date, timeZone);
  return `${year}-${month}-${day}`;
}

/** Every calendar day (YYYY-MM-DD) touched by [from, to) in the given zone. */
export function daysBetween(from: Date, to: Date, timeZone: string, maxDays = 400): string[] {
  const first = isoDay(from, timeZone);
  const last = isoDay(new Date(to.getTime() - 1), timeZone);
  const days: string[] = [];
  const [y, m, d] = first.split('-').map(Number);
  const cursor = new Date(Date.UTC(y, m - 1, d));
  while (days.length < maxDays) {
    const key = cursor.toISOString().slice(0, 10);
    days.push(key);
    if (key >= last) break;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}
