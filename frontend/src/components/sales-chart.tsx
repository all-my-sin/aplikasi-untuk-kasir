import { type DailySalesDTO, formatRupiah } from '@pos/shared';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const compact = (v: number) =>
  v >= 1_000_000_000 ? `${(v / 1_000_000_000).toFixed(1)}M` : v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}jt` : v >= 1000 ? `${Math.round(v / 1000)}rb` : String(v);

const dayLabel = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

/** Revenue & profit bars with transaction count line. */
export function SalesChart({ data, height = 300 }: { data: DailySalesDTO[]; height?: number }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
          <XAxis dataKey="date" tickFormatter={dayLabel} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} minTickGap={16} />
          <YAxis yAxisId="money" tickFormatter={compact} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} width={48} />
          <YAxis yAxisId="count" orientation="right" allowDecimals={false} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} width={32} />
          <Tooltip
            labelFormatter={(l) => dayLabel(String(l))}
            formatter={(value, name) => (name === 'Transactions' ? [value, name] : [formatRupiah(Number(value)), name])}
            contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
          />
          <Legend wrapperStyle={{ fontSize: 13 }} />
          <Bar yAxisId="money" dataKey="revenue" name="Revenue" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={36} />
          <Bar yAxisId="money" dataKey="profit" name="Profit" fill="var(--chart-2)" radius={[4, 4, 0, 0]} maxBarSize={36} />
          <Line yAxisId="count" type="monotone" dataKey="transactions" name="Transactions" stroke="var(--chart-3)" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
