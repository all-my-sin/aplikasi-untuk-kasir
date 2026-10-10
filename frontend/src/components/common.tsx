import { type StockStatus, STOCK_STATUS_LABELS } from '@pos/shared';
import { Package } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/misc';
import { Card } from '@/components/ui/misc';
import { Input, Select } from '@/components/ui/form-controls';
import { type DateRange, PRESET_LABELS, type RangePreset, customRange, presetRange, toInputDate } from '@/lib/dates';
import { cn } from '@/lib/utils';

export function StockBadge({ status }: { status: StockStatus }) {
  const variant = status === 'IN_STOCK' ? 'success' : status === 'LOW_STOCK' ? 'warning' : 'destructive';
  return <Badge variant={variant}>{STOCK_STATUS_LABELS[status]}</Badge>;
}

export function ProductThumb({ src, name, className }: { src: string | null; name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted', className ?? 'size-10')}>
      {src && !failed ? (
        <img src={src} alt={name} className="size-full object-cover" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <Package className="size-1/2 text-muted-foreground/60" aria-hidden />
      )}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  tone?: 'default' | 'success' | 'warning' | 'destructive';
}) {
  const toneClass = {
    default: 'bg-primary/10 text-primary',
    success: 'bg-success/12 text-success',
    warning: 'bg-warning/18 text-[oklch(0.55_0.13_65)]',
    destructive: 'bg-destructive/10 text-destructive',
  }[tone];
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 truncate text-2xl font-semibold tracking-tight">{value}</p>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div className={cn('rounded-lg p-2', toneClass)}>
          <Icon className="size-5" />
        </div>
      </div>
    </Card>
  );
}

export interface RangeState {
  preset: RangePreset;
  from: string; // YYYY-MM-DD, for custom
  to: string;
}

export function initialRange(preset: Exclude<RangePreset, 'custom'>): RangeState {
  const r = presetRange(preset);
  return { preset, from: toInputDate(r.from), to: toInputDate(new Date(r.to.getTime() - 1)) };
}

/** Converts the picker state into a concrete range (null while a custom range is incomplete). */
export function resolveRange(state: RangeState): DateRange | null {
  return state.preset === 'custom' ? customRange(state.from, state.to) : presetRange(state.preset);
}

export function DateRangeFilter({
  value,
  onChange,
  presets = ['today', 'yesterday', 'last7', 'last30', 'thisMonth', 'custom'],
  allowAll = false,
}: {
  value: RangeState | null;
  onChange: (value: RangeState | null) => void;
  presets?: RangePreset[];
  allowAll?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        aria-label="Date range"
        className="w-auto min-w-36"
        value={value?.preset ?? 'all'}
        onChange={(e) => {
          const p = e.target.value as RangePreset | 'all';
          if (p === 'all') return onChange(null);
          if (p === 'custom') return onChange({ ...(value ?? initialRange('today')), preset: 'custom' });
          onChange(initialRange(p));
        }}
      >
        {allowAll && <option value="all">All time</option>}
        {presets.map((p) => (
          <option key={p} value={p}>
            {PRESET_LABELS[p]}
          </option>
        ))}
      </Select>
      {value?.preset === 'custom' && (
        <>
          <Input
            type="date"
            aria-label="From date"
            className="w-auto"
            value={value.from}
            max={value.to}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
          />
          <span className="text-sm text-muted-foreground">to</span>
          <Input
            type="date"
            aria-label="To date"
            className="w-auto"
            value={value.to}
            min={value.from}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
          />
        </>
      )}
    </div>
  );
}
