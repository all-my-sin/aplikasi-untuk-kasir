import { PAYMENT_METHOD_LABELS, formatRupiah } from '@pos/shared';
import { useQuery } from '@tanstack/react-query';
import { FileSpreadsheet, FileText, Printer } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { DateRangeFilter, type RangeState, initialRange, resolveRange } from '@/components/common';
import { SalesChart } from '@/components/sales-chart';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, ErrorState, PageHeader, Spinner, TBody, TD, TH, THead, TR, Table } from '@/components/ui/misc';
import { errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { rangeQuery } from '@/lib/dates';
import { reportsApi } from '@/services';

type ExportType = 'sales' | 'products' | 'transactions';

export default function ReportsPage() {
  const [range, setRange] = useState<RangeState | null>(initialRange('last7'));
  const [exporting, setExporting] = useState<string | null>(null);
  const resolved = range ? resolveRange(range) : null;
  const q = resolved ? rangeQuery(resolved) : null;

  const sales = useQuery({ queryKey: ['reports', 'sales', q], queryFn: () => reportsApi.sales(q!), enabled: !!q });
  const best = useQuery({
    queryKey: ['reports', 'best', q, 20],
    queryFn: () => reportsApi.bestSellers({ ...q!, limit: 20 }),
    enabled: !!q,
  });

  const doExport = async (type: ExportType, format: 'csv' | 'xlsx') => {
    if (!q) return;
    setExporting(`${type}-${format}`);
    try {
      await reportsApi.export({ ...q, type, format });
    } catch (err) {
      toast.error(errorMessage(err, 'Unable to export the report.'));
    } finally {
      setExporting(null);
    }
  };

  const s = sales.data?.summary;
  const periodLabel = resolved ? `${formatDate(resolved.from)} – ${formatDate(new Date(resolved.to.getTime() - 1))}` : '';

  return (
    <div>
      <PageHeader
        title="Reports"
        description={periodLabel ? `Sales and profit for ${periodLabel}` : 'Sales and profit reports'}
        actions={
          <>
            <DateRangeFilter value={range} onChange={setRange} />
            <Button variant="outline" onClick={() => window.print()} disabled={!s}>
              <Printer /> Print / PDF
            </Button>
          </>
        }
      />

      {!q ? (
        <Card>
          <EmptyState title="Choose a date range" description="Select a start and end date to see the report." />
        </Card>
      ) : sales.isError ? (
        <Card>
          <ErrorState message={errorMessage(sales.error)} onRetry={() => sales.refetch()} />
        </Card>
      ) : !s ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Sales</CardTitle>
              </CardHeader>
              <CardContent>
                <Metrics
                  rows={[
                    ['Gross revenue', formatRupiah(s.grossSales)],
                    ['Total discounts', `-${formatRupiah(s.discounts)}`],
                    ['Net revenue', formatRupiah(s.netSales), true],
                    ['Tax collected', formatRupiah(s.tax)],
                    ['Number of transactions', s.transactions.toLocaleString('id-ID')],
                    ['Items sold', s.itemsSold.toLocaleString('id-ID')],
                    ['Average transaction value', formatRupiah(s.averageTransaction)],
                  ]}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Profit</CardTitle>
                <CardDescription>Uses the purchase price recorded at the time of each sale</CardDescription>
              </CardHeader>
              <CardContent>
                <Metrics
                  rows={[
                    ['Revenue (net of discounts)', formatRupiah(s.netSales)],
                    ['Cost of goods sold', `-${formatRupiah(s.cogs)}`],
                    ['Gross profit', formatRupiah(s.grossProfit), true],
                    ['Profit margin', `${s.margin}%`],
                    ['Item margin before discounts', formatRupiah(s.itemProfit)],
                  ]}
                />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Daily sales</CardTitle>
            </CardHeader>
            <CardContent>
              <SalesChart data={sales.data!.daily} />
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Payment methods</CardTitle>
              </CardHeader>
              <CardContent className="px-0 sm:px-0">
                {sales.data!.payments.length === 0 ? (
                  <EmptyState title="No payments in this period" />
                ) : (
                  <Table>
                    <THead>
                      <TR>
                        <TH>Method</TH>
                        <TH className="text-right">Transactions</TH>
                        <TH className="text-right">Amount</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {sales.data!.payments.map((p) => (
                        <TR key={p.method}>
                          <TD>{PAYMENT_METHOD_LABELS[p.method]}</TD>
                          <TD className="text-right">{p.transactions}</TD>
                          <TD className="text-right font-medium">{formatRupiah(p.amount)}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Sales by cashier</CardTitle>
              </CardHeader>
              <CardContent className="px-0 sm:px-0">
                {sales.data!.cashiers.length === 0 ? (
                  <EmptyState title="No sales in this period" />
                ) : (
                  <Table>
                    <THead>
                      <TR>
                        <TH>Cashier</TH>
                        <TH className="text-right">Transactions</TH>
                        <TH className="text-right">Revenue</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {sales.data!.cashiers.map((c) => (
                        <TR key={c.cashierId}>
                          <TD>{c.name}</TD>
                          <TD className="text-right">{c.transactions}</TD>
                          <TD className="text-right font-medium">{formatRupiah(c.revenue)}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Best-selling products</CardTitle>
              <CardDescription>Top 20 by quantity sold</CardDescription>
            </CardHeader>
            <CardContent className="px-0 sm:px-0">
              {best.isLoading ? (
                <Spinner />
              ) : !best.data?.length ? (
                <EmptyState title="No sales in this period" />
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH className="w-14">Rank</TH>
                      <TH>Product</TH>
                      <TH className="text-right">Quantity sold</TH>
                      <TH className="text-right">Revenue</TH>
                      <TH className="text-right">Gross profit</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {best.data.map((b) => (
                      <TR key={b.productId}>
                        <TD className="font-semibold">{b.rank}</TD>
                        <TD>
                          <p className="font-medium">{b.name}</p>
                          <p className="text-xs text-muted-foreground">{b.sku}</p>
                        </TD>
                        <TD className="text-right">{b.quantity}</TD>
                        <TD className="text-right">{formatRupiah(b.revenue)}</TD>
                        <TD className="text-right text-success">{formatRupiah(b.profit)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card className="no-print">
            <CardHeader>
              <CardTitle>Export</CardTitle>
              <CardDescription>Download the selected period as CSV or Excel</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              {(
                [
                  ['sales', 'Sales summary (daily)'],
                  ['products', 'Best-selling products'],
                  ['transactions', 'All transactions'],
                ] as [ExportType, string][]
              ).map(([type, label]) => (
                <div key={type} className="rounded-lg border p-3">
                  <p className="mb-2 text-sm font-medium">{label}</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" loading={exporting === `${type}-csv`} onClick={() => doExport(type, 'csv')}>
                      <FileText /> CSV
                    </Button>
                    <Button size="sm" variant="outline" loading={exporting === `${type}-xlsx`} onClick={() => doExport(type, 'xlsx')}>
                      <FileSpreadsheet /> Excel
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function Metrics({ rows }: { rows: [string, string, boolean?][] }) {
  return (
    <dl className="divide-y text-sm">
      {rows.map(([label, value, strong]) => (
        <div key={label} className="flex items-center justify-between py-2">
          <dt className={strong ? 'font-semibold' : 'text-muted-foreground'}>{label}</dt>
          <dd className={strong ? 'text-base font-bold text-primary' : 'font-medium'}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
