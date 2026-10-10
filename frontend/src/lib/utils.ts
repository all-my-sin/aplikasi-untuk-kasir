import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export { formatNumber, formatRupiah } from '@pos/shared';

const dateTimeFmt = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const dateFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

export const formatDateTime = (value: string | Date) => dateTimeFmt.format(new Date(value));
export const formatDate = (value: string | Date) => dateFmt.format(new Date(value));

/** Parses "10.000", "10000", "Rp 10.000" into 10000; returns NaN for garbage. */
export function parseAmount(input: string): number {
  const digits = input.replace(/[^\d]/g, '');
  return digits ? Number(digits) : NaN;
}

export function newClientRef(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
