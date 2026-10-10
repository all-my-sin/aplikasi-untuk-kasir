import { formatRupiah } from '@pos/shared';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Boxes, PackageX, Receipt, ShoppingBag, TrendingUp, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { DateRangeFilter, type RangeState, StatCard, StockBadge, initialRange, resolveRange } from '@/components/common';
import { SalesChart } from '@/components/sales-chart';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, ErrorState, PageHeader, Skeleton, Spinner, TBody, TD, TH, THead, TR, Table } from '@/components/ui/misc';
import { errorMessage } from '@/lib/api';
import { presetRange, rangeQuery } from '@/lib/dates';
import { reportsApi } from '@/services';

export default function DashboardPage() {
  const [chartRange, setChartRange] = useState<RangeState | null>(initialRange('last7'));
  const today = rangeQuery(presetRange('today'));
  const chart = chartRange ? resolveRange(chartRange) : null;
  const chartQ = chart ? rangeQuery(chart) : null;

  const dashboard = useQuery({
    queryKey: ['dashboard', today.from],
    queryFn: () => reportsApi.dashboard(today),
    refetchInterval: 60_000,
  });
  const sales = useQuery({
    queryKey: ['reports', 'sales', chartQ],
    queryFn: () => reportsApi.sales(chartQ!),
    enabled: !!chartQ,
  });
  const best = useQuery({
    queryKey: ['reports', 'best', chartQ],
    queryFn: () => reportsApi.bestSellers({ ...chartQ!, limit: 10 }),
    enabled: !!chartQ,
  });

  const d = dashboard.data;

  return (
    <div>
      <PageHeader title="Dashboard" description="Today's performance and stock alerts at a glance." />

      {dashboard.isError ? (
        <Card>
          <ErrorState message={errorMessage(dashboard.error)} onRetry={() => dashboard.refetch()} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {!d ? (
            Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="h-24" />)
          ) : (
            <>
              <StatCard label="Today's Revenue" value={formatRupiah(d.today.netSales)} icon={Wallet} />
              <StatCard label="Today's Transactions" value={d.today.transactions} icon={Receipt} hint={`Avg ${formatRupiah(d.today.averageTransaction)}`} />
              <StatCard label="Items Sold Today" value={d.today.itemsSold} icon={ShoppingBag} />
              <StatCard label="Today's Gross Profit" value={formatRupiah(d.today.grossProfit)} icon={TrendingUp} tone="success" hint={`Margin ${d.today.margin}%`} />
              <StatCard label="Total Products" value={d.totalProducts} icon={Boxes} hint="Active products" />
              <StatCard label="Low Stock Products" value={d.lowStockCount} icon={AlertTriangle} tone="warning" />
              <StatCard label="Out-of-Stock Products" value={d.outOfStockCount} icon={PackageX} tone="destructive" />
            </>
          )}
        </div>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Sales</CardTitle>
              <CardDescription>Revenue, profit and number of transactions per day</CardDescription>
            </div>
            <DateRangeFilter value={chartRange} onChange={setChartRange} presets={['last7', 'last30', 'thisMonth', 'custom']} />
          </CardHeader>
          <CardContent>
            {!chart ? (
              <p className="py-16 text-center text-sm text-muted-foreground">Choose a valid date range.</p>
            ) : sales.isLoading ? (
              <Spinner className="h-[300px]" />
            ) : sales.isError ? (
              <ErrorState message={errorMessage(sales.error)} onRetry={() => sales.refetch()} />
            ) : (
              <SalesChart data={sales.data?.daily ?? []} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Low Stock Alert</CardTitle>
              <CardDescription>At or below minimum stock</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/inventory">Inventory</Link>
            </Button>
          </CardHeader>
          <CardContent className="px-0 sm:px-0">
            {!d ? (
              <Spinner />
            ) : d.lowStockProducts.length === 0 ? (
              <EmptyState title="All stocked up" description="No products are below their minimum stock." />
            ) : (
              <ul className="divide-y">
                {d.lowStockProducts.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.sku} · min {p.minStock}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-sm font-semibold">
                        {p.stock} {p.unit}
                      </span>
                      <StockBadge status={p.stockStatus} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Best-Selling Products</CardTitle>
          <CardDescription>Top 10 by quantity sold in the selected period</CardDescription>
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
                  <TH className="w-12">#</TH>
                  <TH>Product</TH>
                  <TH className="text-right">Qty sold</TH>
                  <TH className="text-right">Revenue</TH>
                  <TH className="text-right">Gross profit</TH>
                </TR>
              </THead>
              <TBody>
                {best.data.map((b) => (
                  <TR key={b.productId}>
                    <TD className="font-semibold text-muted-foreground">{b.rank}</TD>
                    <TD>
                      <p className="font-medium">{b.name}</p>
                      <p className="text-xs text-muted-foreground">{b.sku}</p>
                    </TD>
                    <TD className="text-right font-medium">{b.quantity}</TD>
                    <TD className="text-right">{formatRupiah(b.revenue)}</TD>
                    <TD className="text-right text-success">{formatRupiah(b.profit)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
