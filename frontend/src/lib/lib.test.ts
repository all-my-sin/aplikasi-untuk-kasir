import { describe, expect, it } from 'vitest';
import { customRange, presetRange, toInputDate } from './dates';
import { parseAmount } from './utils';

describe('date range presets', () => {
  const now = new Date(2026, 9, 7, 14, 30); // Wed 7 Oct 2026, 14:30 local

  it('today and yesterday are whole local days', () => {
    expect(presetRange('today', now)).toEqual({ from: new Date(2026, 9, 7), to: new Date(2026, 9, 8) });
    expect(presetRange('yesterday', now)).toEqual({ from: new Date(2026, 9, 6), to: new Date(2026, 9, 7) });
  });

  it('this week starts on Monday', () => {
    expect(presetRange('thisWeek', now).from).toEqual(new Date(2026, 9, 5));
  });

  it('last 7 / 30 days include today', () => {
    expect(presetRange('last7', now).from).toEqual(new Date(2026, 9, 1));
    expect(presetRange('last30', now).from).toEqual(new Date(2026, 8, 8));
  });

  it('this month starts on the 1st', () => {
    expect(presetRange('thisMonth', now).from).toEqual(new Date(2026, 9, 1));
  });

  it('custom ranges are inclusive of the end day and validated', () => {
    expect(customRange('2026-10-01', '2026-10-03')).toEqual({ from: new Date(2026, 9, 1), to: new Date(2026, 9, 4) });
    expect(customRange('2026-10-05', '2026-10-01')).toBeNull();
    expect(customRange('', '2026-10-01')).toBeNull();
    expect(toInputDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('parseAmount', () => {
  it('accepts formatted rupiah input', () => {
    expect(parseAmount('10.000')).toBe(10000);
    expect(parseAmount('Rp 125.500')).toBe(125500);
    expect(parseAmount('50000')).toBe(50000);
    expect(parseAmount('')).toBeNaN();
    expect(parseAmount('abc')).toBeNaN();
  });
});
