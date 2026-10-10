import {
  type AdjustmentKind,
  MOVEMENT_TYPES,
  MOVEMENT_TYPE_LABELS,
  type ProductDTO,
  STOCK_STATUSES,
  STOCK_STATUS_LABELS,
  getStockStatus,
} from '@pos/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, Boxes, ClipboardCheck, History, Minus, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { DateRangeFilter, type RangeState, StockBadge, resolveRange } from '@/components/common';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/form-controls';
import { Badge, Card, EmptyState, ErrorState, PageHeader, Pagination, Spinner, TBody, TD, TH, THead, TR, Table, Tabs } from '@/components/ui/misc';
import { useCategories, useDebounce } from '@/hooks/common';
import { errorMessage } from '@/lib/api';
import { rangeQuery } from '@/lib/dates';
import { cn, formatDateTime } from '@/lib/utils';
import { inventoryApi } from '@/services';

type Tab = 'stock' | 'movements' | 'opname';

export default function InventoryPage() {
  const [tab, setTab] = useState<Tab>('stock');
  const [historyFor, setHistoryFor] = useState<ProductDTO | null>(null);
  return (
    <div>
      <PageHeader title="Inventory" description="Track stock levels, record adjustments and run stock counts." />
      <Tabs<Tab>
        className="mb-4"
        value={tab}
        onChange={(t) => {
          setTab(t);
          if (t !== 'movements') setHistoryFor(null);
        }}
        tabs={[
          { value: 'stock', label: 'Stock levels', icon: Boxes },
          { value: 'movements', label: 'Movement history', icon: History },
          { value: 'opname', label: 'Stock opname', icon: ClipboardCheck },
        ]}
      />
      {tab === 'stock' && (
        <StockTab
          onHistory={(p) => {
            setHistoryFor(p);
            setTab('movements');
          }}
        />
      )}
      {tab === 'movements' && <MovementsTab product={historyFor} onClearProduct={() => setHistoryFor(null)} />}
      {tab === 'opname' && <OpnameTab />}
    </div>
  );
}

// ------------------------------------------------------------------ Stock levels
function StockTab({ onHistory }: { onHistory: (p: ProductDTO) => void }) {
  const { data: categories } = useCategories();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [page, setPage] = useState(1);
  const [adjusting, setAdjusting] = useState<ProductDTO | null>(null);
  const debounced = useDebounce(search.trim());
  useEffect(() => setPage(1), [debounced, status, categoryId]);

  const q = { search: debounced, stockStatus: status, categoryId, page, pageSize: 25, sort: status ? 'stock' : 'name' };
  const list = useQuery({ queryKey: ['inventory', q], queryFn: () => inventoryApi.list(q), placeholderData: keepPreviousData });

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <div className="relative min-w-48 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search product or SKU…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select aria-label="Category" className="w-auto" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">All categories</option>
          {categories?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <div className="flex flex-wrap gap-1">
          {[['', 'All'] as const, ...STOCK_STATUSES.map((s) => [s, STOCK_STATUS_LABELS[s]] as const)].map(([value, label]) => (
            <Button key={value} size="sm" variant={status === value ? 'default' : 'outline'} onClick={() => setStatus(value)}>
              {label}
            </Button>
          ))}
        </div>
      </div>
      {list.isLoading ? (
        <Spinner />
      ) : list.isError ? (
        <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
      ) : list.data?.data.length === 0 ? (
        <EmptyState icon={Boxes} title="No products match" />
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                <TH>Product</TH>
                <TH>SKU</TH>
                <TH className="text-right">Current stock</TH>
                <TH className="text-right">Minimum stock</TH>
                <TH>Status</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {list.data?.data.map((p) => (
                <TR key={p.id}>
                  <TD className="font-medium">{p.name}</TD>
                  <TD className="text-muted-foreground">{p.sku}</TD>
                  <TD className={cn('text-right font-semibold', p.stockStatus === 'OUT_OF_STOCK' && 'text-destructive')}>
                    {p.stock} <span className="font-normal text-muted-foreground">{p.unit}</span>
                  </TD>
                  <TD className="text-right">{p.minStock}</TD>
                  <TD>
                    <StockBadge status={p.stockStatus} />
                  </TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => setAdjusting(p)}>
                        <SlidersHorizontal /> Adjust
                      </Button>
                      <Button size="icon-sm" variant="ghost" aria-label={`History of ${p.name}`} onClick={() => onHistory(p)}>
                        <History />
                      </Button>
                    </div>
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
      <AdjustDialog product={adjusting} onClose={() => setAdjusting(null)} />
    </Card>
  );
}

const REASONS: Record<AdjustmentKind, string[]> = {
  ADD: ['Restock', 'Supplier delivery', 'Customer return', 'Found during count'],
  REMOVE: ['Damaged', 'Expired', 'Lost / stolen', 'Internal use', 'Returned to supplier'],
  SET: ['Recount correction', 'Data entry correction'],
};

function AdjustDialog({ product, onClose }: { product: ProductDTO | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<AdjustmentKind>('ADD');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState(REASONS.ADD[0]);
  const [customReason, setCustomReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (product) {
      setKind('ADD');
      setQuantity('');
      setReason(REASONS.ADD[0]);
      setCustomReason('');
      setError(null);
    }
  }, [product]);

  const qty = Number(quantity);
  const validQty = quantity !== '' && Number.isInteger(qty) && qty >= 0 && (kind === 'SET' || qty > 0);
  const newStock = !product || !validQty ? null : kind === 'ADD' ? product.stock + qty : kind === 'REMOVE' ? product.stock - qty : qty;
  const finalReason = reason === 'Other' ? customReason.trim() : reason;

  const mutation = useMutation({
    mutationFn: () => inventoryApi.adjust({ productId: product!.id, kind, quantity: qty, reason: finalReason }),
    onSuccess: (m) => {
      toast.success(`Stock of "${product?.name}" is now ${m.newStock}.`);
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['pos-products'] });
      queryClient.invalidateQueries({ queryKey: ['movements'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
    onError: (err) => setError(errorMessage(err, 'Unable to adjust stock.')),
  });

  const submit = () => {
    setError(null);
    if (!validQty) return setError(kind === 'SET' ? 'Enter a whole number of 0 or more.' : 'Quantity must be greater than zero.');
    if (newStock !== null && newStock < 0) return setError(`Cannot remove more than the current stock (${product?.stock}).`);
    if (!finalReason) return setError('Please give a reason.');
    mutation.mutate();
  };

  const kinds: { value: AdjustmentKind; label: string; icon: typeof Plus }[] = [
    { value: 'ADD', label: 'Add stock', icon: Plus },
    { value: 'REMOVE', label: 'Remove stock', icon: Minus },
    { value: 'SET', label: 'Set exact', icon: ArrowLeftRight },
  ];

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
          <DialogDescription>
            {product?.name} — current stock <strong>{product?.stock}</strong> {product?.unit}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {kinds.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  onClick={() => {
                    setKind(k.value);
                    setReason(REASONS[k.value][0]);
                  }}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-xs font-medium',
                    kind === k.value ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted',
                  )}
                >
                  <k.icon className="size-4" /> {k.label}
                </button>
              ))}
            </div>
            <Field label={kind === 'SET' ? 'New stock quantity' : 'Quantity'} htmlFor="adj-qty" required>
              <Input id="adj-qty" type="number" min={0} step={1} autoFocus value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </Field>
            <Field label="Reason" htmlFor="adj-reason" required>
              <Select id="adj-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
                {[...REASONS[kind], 'Other'].map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </Select>
            </Field>
            {reason === 'Other' && (
              <Input aria-label="Custom reason" placeholder="Describe the reason" value={customReason} maxLength={200} onChange={(e) => setCustomReason(e.target.value)} />
            )}
            {newStock !== null && product && (
              <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm">
                <span>
                  {product.stock} → <strong className={cn(newStock < 0 && 'text-destructive')}>{newStock}</strong>
                </span>
                {newStock >= 0 && <StockBadge status={getStockStatus(newStock, product.minStock)} />}
              </div>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              Save adjustment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ Movements
function MovementsTab({ product, onClearProduct }: { product: ProductDTO | null; onClearProduct: () => void }) {
  const [type, setType] = useState('');
  const [range, setRange] = useState<RangeState | null>(null);
  const [page, setPage] = useState(1);
  const resolved = range ? resolveRange(range) : null;
  useEffect(() => setPage(1), [type, range, product]);

  const q = { productId: product?.id, type, page, pageSize: 25, ...(resolved ? rangeQuery(resolved) : {}) };
  const list = useQuery({ queryKey: ['movements', q], queryFn: () => inventoryApi.movements(q), placeholderData: keepPreviousData });

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        {product && (
          <Badge variant="outline" className="h-8 gap-2 px-3 text-sm">
            {product.name}
            <button type="button" aria-label="Show all products" onClick={onClearProduct} className="text-muted-foreground hover:text-foreground">
              ×
            </button>
          </Badge>
        )}
        <Select aria-label="Movement type" className="w-auto" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All movement types</option>
          {MOVEMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {MOVEMENT_TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
        <DateRangeFilter value={range} onChange={setRange} allowAll />
      </div>
      {list.isLoading ? (
        <Spinner />
      ) : list.isError ? (
        <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
      ) : list.data?.data.length === 0 ? (
        <EmptyState icon={History} title="No stock movements" />
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Product</TH>
                <TH>Type</TH>
                <TH className="text-right">Previous</TH>
                <TH className="text-right">Change</TH>
                <TH className="text-right">New</TH>
                <TH>Reason</TH>
                <TH>User</TH>
              </TR>
            </THead>
            <TBody>
              {list.data?.data.map((m) => (
                <TR key={m.id}>
                  <TD className="whitespace-nowrap text-muted-foreground">{formatDateTime(m.createdAt)}</TD>
                  <TD>
                    <p className="font-medium">{m.product.name}</p>
                    <p className="text-xs text-muted-foreground">{m.product.sku}</p>
                  </TD>
                  <TD>
                    <Badge variant={m.quantityChange >= 0 ? 'success' : 'secondary'}>{MOVEMENT_TYPE_LABELS[m.type]}</Badge>
                  </TD>
                  <TD className="text-right">{m.previousStock}</TD>
                  <TD className={cn('text-right font-semibold', m.quantityChange >= 0 ? 'text-success' : 'text-destructive')}>
                    {m.quantityChange > 0 ? `+${m.quantityChange}` : m.quantityChange}
                  </TD>
                  <TD className="text-right font-medium">{m.newStock}</TD>
                  <TD className="max-w-56 truncate text-muted-foreground" title={m.reason ?? ''}>
                    {m.transaction ? (
                      <Link to="/transactions" className="text-primary hover:underline">
                        {m.reason}
                      </Link>
                    ) : (
                      (m.reason ?? '—')
                    )}
                  </TD>
                  <TD>{m.user?.name ?? '—'}</TD>
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
  );
}

// ------------------------------------------------------------------ Stock opname
function OpnameTab() {
  const queryClient = useQueryClient();
  const { data: categories } = useCategories();
  const [categoryId, setCategoryId] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [counts, setCounts] = useState<Record<number, { value: string; product: ProductDTO }>>({});
  const [note, setNote] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const debounced = useDebounce(search.trim());
  useEffect(() => setPage(1), [debounced, categoryId]);

  const q = { search: debounced, categoryId, page, pageSize: 50, sort: 'name' };
  const list = useQuery({ queryKey: ['inventory', 'opname', q], queryFn: () => inventoryApi.list(q), placeholderData: keepPreviousData });

  const entered = Object.entries(counts)
    .filter(([, c]) => c.value !== '' && Number.isInteger(Number(c.value)) && Number(c.value) >= 0)
    .map(([id, c]) => ({ productId: Number(id), countedStock: Number(c.value), product: c.product }));
  const differences = entered.filter((e) => e.countedStock !== e.product.stock);

  const mutation = useMutation({
    mutationFn: () =>
      inventoryApi.opname({ items: entered.map(({ productId, countedStock }) => ({ productId, countedStock })), note: note || null }),
    onSuccess: (r) => {
      toast.success(`Stock opname saved: ${r.counted} counted, ${r.corrected} corrected.`);
      setCounts({});
      setNote('');
      setConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['movements'] });
    },
    onError: (err) => {
      toast.error(errorMessage(err, 'Unable to save the stock opname.'));
      setConfirmOpen(false);
    },
  });

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <div className="relative min-w-48 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search product or SKU…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select aria-label="Category" className="w-auto" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">All categories</option>
          {categories?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <p className="text-sm text-muted-foreground">Enter the physically counted quantity. Leave blank to skip a product.</p>
      </div>
      {list.isLoading ? (
        <Spinner />
      ) : list.isError ? (
        <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                <TH>Product</TH>
                <TH className="text-right">System stock</TH>
                <TH className="w-36 text-right">Counted</TH>
                <TH className="text-right">Difference</TH>
              </TR>
            </THead>
            <TBody>
              {list.data?.data.map((p) => {
                const value = counts[p.id]?.value ?? '';
                const diff = value === '' ? null : Number(value) - p.stock;
                return (
                  <TR key={p.id}>
                    <TD>
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.sku}</p>
                    </TD>
                    <TD className="text-right">
                      {p.stock} {p.unit}
                    </TD>
                    <TD className="text-right">
                      <Input
                        aria-label={`Counted stock of ${p.name}`}
                        type="number"
                        min={0}
                        step={1}
                        className="ml-auto h-8 w-28 text-right"
                        value={value}
                        onChange={(e) => setCounts((c) => ({ ...c, [p.id]: { value: e.target.value, product: p } }))}
                      />
                    </TD>
                    <TD
                      className={cn(
                        'text-right font-semibold',
                        diff === null || diff === 0 ? 'text-muted-foreground' : diff > 0 ? 'text-success' : 'text-destructive',
                      )}
                    >
                      {diff === null ? '—' : diff > 0 ? `+${diff}` : diff}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          {list.data && (
            <Pagination page={list.data.page} totalPages={list.data.totalPages} total={list.data.total} pageSize={list.data.pageSize} onPageChange={setPage} />
          )}
        </>
      )}
      <div className="flex flex-col gap-2 border-t p-3 sm:flex-row sm:items-center">
        <Input className="sm:max-w-sm" placeholder="Note (optional), e.g. Monthly count October" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
        <p className="text-sm text-muted-foreground sm:ml-auto">
          {entered.length} counted · {differences.length} with differences
        </p>
        <Button disabled={entered.length === 0} onClick={() => setConfirmOpen(true)}>
          <ClipboardCheck /> Save stock opname
        </Button>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Save stock opname?"
        description={`${entered.length} product(s) counted. ${differences.length} stock level(s) will be corrected and recorded in the movement history.`}
        confirmLabel="Save"
        loading={mutation.isPending}
        onConfirm={() => mutation.mutate()}
      />
    </Card>
  );
}
