import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { categoriesApi, settingsApi } from '@/services';

export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: settingsApi.get, staleTime: 5 * 60_000 });
}

export function useCategories(includeInactive = false) {
  return useQuery({
    queryKey: ['categories', { includeInactive }],
    queryFn: () => categoriesApi.list(includeInactive ? { isActive: 'all' } : { isActive: 'true' }),
    staleTime: 60_000,
  });
}

/** Global keyboard shortcuts, e.g. { F2: focusSearch, F4: openPayment }. */
export function useHotkeys(map: Record<string, (e: KeyboardEvent) => void>, enabled = true) {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      const fn = ref.current[e.key];
      if (fn) {
        e.preventDefault();
        fn(e);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled]);
}

/**
 * Captures input from USB barcode scanners when no text field is focused.
 * Scanners "type" characters very quickly and finish with Enter; we treat a
 * burst of ≥4 characters with < 50ms between keys followed by Enter as a scan.
 */
export function useBarcodeScanner(onScan: (code: string) => void, enabled = true) {
  const cb = useRef(onScan);
  cb.current = onScan;
  useEffect(() => {
    if (!enabled) return;
    let buffer = '';
    let last = 0;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      if (typing || e.ctrlKey || e.altKey || e.metaKey) return;
      if (document.querySelector('[role="dialog"]')) return;

      const now = performance.now();
      if (now - last > 50) buffer = '';
      last = now;

      if (e.key === 'Enter') {
        if (buffer.length >= 4) {
          e.preventDefault();
          cb.current(buffer);
        }
        buffer = '';
      } else if (e.key.length === 1) {
        buffer += e.key;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled]);
}
