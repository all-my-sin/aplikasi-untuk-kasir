// Date range presets. Ranges are [from, to) in the browser's local time and
// sent to the API as ISO timestamps together with the browser time zone.

export type RangePreset = 'today' | 'yesterday' | 'thisWeek' | 'last7' | 'last30' | 'thisMonth' | 'custom';

export const PRESET_LABELS: Record<RangePreset, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  thisWeek: 'This week',
  last7: 'Last 7 days',
  last30: 'Last 30 days',
  thisMonth: 'This month',
  custom: 'Custom range',
};

export interface DateRange {
  from: Date;
  to: Date;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export function presetRange(preset: Exclude<RangePreset, 'custom'>, now = new Date()): DateRange {
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  switch (preset) {
    case 'today':
      return { from: today, to: tomorrow };
    case 'yesterday':
      return { from: addDays(today, -1), to: today };
    case 'thisWeek': {
      const mondayOffset = (today.getDay() + 6) % 7; // weeks start on Monday
      return { from: addDays(today, -mondayOffset), to: tomorrow };
    }
    case 'last7':
      return { from: addDays(today, -6), to: tomorrow };
    case 'last30':
      return { from: addDays(today, -29), to: tomorrow };
    case 'thisMonth':
      return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: tomorrow };
  }
}

/** "YYYY-MM-DD" for <input type="date"> in local time. */
export function toInputDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Inclusive custom day range from two YYYY-MM-DD strings. */
export function customRange(fromStr: string, toStr: string): DateRange | null {
  if (!fromStr || !toStr) return null;
  const [fy, fm, fd] = fromStr.split('-').map(Number);
  const [ty, tm, td] = toStr.split('-').map(Number);
  const from = new Date(fy, fm - 1, fd);
  const to = new Date(ty, tm - 1, td + 1);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) return null;
  return { from, to };
}

export const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function rangeQuery(range: DateRange) {
  return { from: range.from.toISOString(), to: range.to.toISOString(), tz: browserTimeZone() };
}
