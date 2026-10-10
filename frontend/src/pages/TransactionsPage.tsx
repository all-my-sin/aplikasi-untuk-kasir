import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS, formatRupiah } from '@pos/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Receipt, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { DateRangeFilter, type RangeState, initialRange, resolveRange } from '@/components/common';
import { ReceiptPanel } from '@/components/receipt';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form-controls';
import { Badge, Card, EmptyState, ErrorState, PageHeader, Pagination, Spinner, TBody, TD, TH, THead, TR, Table } from '@/components/ui/misc';
import { useDebounce, useSettings } from '@/hooks/common';
import { useAuth } from '@/hooks/useAuth';
import { errorMessage } from '@/lib/api';
import { rangeQuery } from '@/lib/dates';
import { formatDateTime } from '@/lib/utils';
import { transactionsApi, usersApi } from '@/services';

export default function TransactionsPage() {
  const { isAdmin } = useAuth();
  const [range, setRange] = useState<RangeState | null>(initialRange('today'));
  const [search, setSearch] = useState('');
  const [cashierId, setCashierId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const debounced = useDebounce(search.trim());
  const resolved = range ? resolveRange(range) : null;
  const rq = resolved ? rangeQuery(resolved) : {};

  useEffect(() => setPage(1), [debounced, cashierId, paymentMethod, status, range]);

  const cashiers = useQuery({ queryKey: ['user-options'], queryFn: usersApi.options, enabled: isAdmin, staleTime: 60_000 });
  const query = { ...rq, search: debounced, cashierId, paymentMethod, status, page, pageSize: 20 };
  const list = useQuery({
    queryKey: ['transactions', query],
    queryFn: () => transactionsApi.list(query),
    placeholderData: keepPreviousData,
    enabled: !range || !!resolved,
  });

  return (
    <div>
      <PageHeader title="Transactions" description={isAdmin ? 'All sales transactions' : 'Your sales transactions'} />

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <div className="relative min-w-48 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search transaction number…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <DateRangeFilter
            value={range}
            onChange={setRange}
            allowAll
            presets={['today', 'yesterday', 'thisWeek', 'thisMonth', 'custom']}
          />
          {isAdmin && (
            <Select aria-label="Cashier" className="w-auto" value={cashierId} onChange={(e) => setCashierId(e.target.value)}>
              <option value="">All cashiers</option>
              {cashiers.data?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          )}
          <Select aria-label="Payment method" className="w-auto" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
            <option value="">All payments</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </Select>
          <Select aria-label="Status" className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any status</option>
            <option value="COMPLETED">Completed</option>
            <option value="VOIDED">Voided</option>
          </Select>
          {list.data && (
            <p className="ml-auto text-sm text-muted-foreground">
              Completed total: <span className="font-semibold text-foreground">{formatRupiah(list.data.totalAmount)}</span>
            </p>
          )}
        </div>

        {list.isLoading ? (
          <Spinner />
        ) : list.isError ? (
          <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
        ) : list.data?.data.length === 0 ? (
          <EmptyState icon={Receipt} title="No transactions found" description="Try changing the filters or date range." />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Transaction</TH>
                  <TH>Date / time</TH>
                  <TH>Cashier</TH>
                  <TH className="text-right">Items</TH>
                  <TH className="text-right">Total</TH>
                  <TH>Payment</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {list.data?.data.map((t) => (
                  <TR
                    key={t.id}
                    tabIndex={0}
                    className="cursor-pointer"
                    onClick={() => setSelectedId(t.id)}
                    onKeyDown={(e) => e.key === 'Enter' && setSelectedId(t.id)}
                  >
                    <TD className="font-mono text-xs font-medium sm:text-sm">{t.number}</TD>
                    <TD className="whitespace-nowrap">{formatDateTime(t.createdAt)}</TD>
                    <TD>{t.cashier.name}</TD>
                    <TD className="text-right">{t.itemCount}</TD>
                    <TD className="text-right font-semibold">{formatRupiah(t.total)}</TD>
                    <TD>{t.paymentMethods.map((m) => PAYMENT_METHOD_LABELS[m]).join(', ')}</TD>
                    <TD>
                      <StatusBadge status={t.status} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {list.data && (
              <Pagination page={list.data.page} totalPages={list.data.totalPages} total={list.data.total} pageSize={list.data.pageSize} onPageChange={setPage} />
            )}
          </>
        )}
      </Card>

      <TransactionDetailDialog id={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}

function StatusBadge({ status }: { status: 'COMPLETED' | 'VOIDED' }) {
  return status === 'COMPLETED' ? <Badge variant="success">Completed</Badge> : <Badge variant="destructive">Voided</Badge>;
}

function TransactionDetailDialog({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { isAdmin } = useAuth();
  const { data: settings } = useSettings();
  const queryClient = useQueryClient();
  const [voidOpen, setVoidOpen] = useState(false);
  const [reason, setReason] = useState('');

  const detail = useQuery({ queryKey: ['transactions', 'detail', id], queryFn: () => transactionsApi.get(id!), enabled: id !== null });
  const voidMutation = useMutation({
    mutationFn: () => transactionsApi.void(id!, reason),
    onSuccess: (t) => {
      toast.success(`Transaction ${t.number} voided and stock returned.`);
      queryClient.setQueryData(['transactions', 'detail', id], t);
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setVoidOpen(false);
      setReason('');
    },
    onError: (err) => toast.error(errorMessage(err, 'Unable to void the transaction.')),
  });

  const t = detail.data;
  return (
    <>
      <Dialog open={id !== null} onOpenChange={(o) => !o && onClose()}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              {t?.number ?? 'Transaction'} {t && <StatusBadge status={t.status} />}
            </DialogTitle>
            {t && (
              <DialogDescription>
                {formatDateTime(t.createdAt)} · Cashier: {t.cashier.name}
              </DialogDescription>
            )}
          </DialogHeader>
          <DialogBody>
            {detail.isLoading ? (
              <Spinner />
            ) : detail.isError ? (
              <ErrorState message={errorMessage(detail.error)} onRetry={() => detail.refetch()} />
            ) : t ? (
              <div className="grid gap-5 lg:grid-cols-[1fr_auto]">
                <div className="min-w-0 space-y-4">
                  {t.status === 'VOIDED' && (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                      Voided by <strong>{t.voidedBy?.name}</strong> on {t.voidedAt && formatDateTime(t.voidedAt)}
                      <br />
                      Reason: {t.voidReason}
                    </div>
                  )}
                  <div className="overflow-hidden rounded-lg border">
                    <Table>
                      <THead>
                        <TR>
                          <TH>Product</TH>
                          <TH className="text-right">Qty</TH>
                          <TH className="text-right">Price</TH>
                          <TH className="text-right">Subtotal</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {t.items.map((i) => (
                          <TR key={i.id}>
                            <TD>
                              <p className="font-medium">{i.productName}</p>
                              <p className="text-xs text-muted-foreground">{i.sku}</p>
                            </TD>
                            <TD className="text-right">
                              {i.quantity} {i.unit}
                            </TD>
                            <TD className="text-right">{formatRupiah(i.unitPrice)}</TD>
                            <TD className="text-right font-medium">{formatRupiah(i.subtotal)}</TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </div>
                  <dl className="ml-auto max-w-xs space-y-1.5 text-sm">
                    <Line label="Subtotal" value={formatRupiah(t.subtotal)} />
                    {t.discountAmount > 0 && (
                      <Line
                        label={`Discount${t.discountType === 'PERCENT' ? ` (${t.discountValue}%)` : ''}`}
                        value={`-${formatRupiah(t.discountAmount)}`}
                      />
                    )}
                    {t.taxAmount > 0 && <Line label={`Tax (${t.taxRate}%)`} value={formatRupiah(t.taxAmount)} />}
                    <Line label="Total" value={formatRupiah(t.total)} strong />
                    {t.payments.map((p) => (
                      <Line
                        key={p.id}
                        label={`${PAYMENT_METHOD_LABELS[p.method]}${p.reference ? ` (${p.reference})` : ''}`}
                        value={formatRupiah(p.amount)}
                      />
                    ))}
                    <Line label="Change" value={formatRupiah(t.change)} />
                    {isAdmin && t.totalCost !== undefined && (
                      <Line label="Gross profit" value={formatRupiah(t.subtotal - t.discountAmount - t.totalCost)} />
                    )}
                  </dl>
                  {t.note && <p className="text-sm text-muted-foreground">Note: {t.note}</p>}
                </div>
                {settings && <ReceiptPanel transaction={t} settings={settings} reprint />}
              </div>
            ) : null}
          </DialogBody>
          {isAdmin && t?.status === 'COMPLETED' && (
            <DialogFooter>
              <Button variant="destructive" onClick={() => setVoidOpen(true)}>
                <Ban /> Void transaction
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Void {t?.number}?</DialogTitle>
            <DialogDescription>The sale is cancelled, excluded from reports, and all items are returned to stock.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field label="Reason" htmlFor="void-reason" required>
              <Textarea id="void-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer returned the items" maxLength={200} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" loading={voidMutation.isPending} disabled={reason.trim().length < 3} onClick={() => voidMutation.mutate()}>
              Void transaction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={strong ? 'flex justify-between border-t pt-1.5 text-base font-semibold' : 'flex justify-between'}>
      <dt className={strong ? '' : 'text-muted-foreground'}>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
