import { type DiscountTypeValue, type ProductDTO, type TransactionDTO, calculateTotals, formatRupiah } from '@pos/shared';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, CheckCircle2, Minus, Plus, ScanBarcode, ShoppingCart, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CameraScanner } from '@/components/camera-scanner';
import { ProductThumb, StockBadge } from '@/components/common';
import { ReceiptPanel } from '@/components/receipt';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/form-controls';
import { EmptyState, ErrorState, Pagination, Skeleton } from '@/components/ui/misc';
import { useBarcodeScanner, useCategories, useDebounce, useHotkeys, useSettings } from '@/hooks/common';
import { useAuth } from '@/hooks/useAuth';
import { type AddResult, useCart } from '@/hooks/useCart';
import { ApiError, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { productsApi } from '@/services';
import { PaymentDialog } from './pos/PaymentDialog';

const PAGE_SIZE = 40;

export default function PosPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: settings } = useSettings();
  const { data: categories } = useCategories();
  const cart = useCart(user?.id);

  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search.trim(), 250);
  const searchRef = useRef<HTMLInputElement>(null);

  const [discountType, setDiscountType] = useState<DiscountTypeValue>('PERCENT');
  const [discountValue, setDiscountValue] = useState(0);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [completed, setCompleted] = useState<TransactionDTO | null>(null);

  useEffect(() => setPage(1), [debouncedSearch, categoryId]);

  // Apply the store's default discount for every new sale
  const resetDiscount = useCallback(() => {
    const def = settings?.defaultDiscountPercent ?? 0;
    setDiscountType('PERCENT');
    setDiscountValue(def);
  }, [settings?.defaultDiscountPercent]);
  useEffect(() => {
    if (cart.items.length === 0) resetDiscount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetDiscount]);

  const products = useQuery({
    queryKey: ['pos-products', { search: debouncedSearch, categoryId, page }],
    queryFn: () =>
      productsApi.list({ search: debouncedSearch, categoryId, page, pageSize: PAGE_SIZE, sort: 'name', isActive: 'true' }),
    placeholderData: keepPreviousData,
  });

  const taxRate = settings?.taxEnabled ? settings.taxRate : 0;
  const totals = calculateTotals({
    items: cart.items.map((i) => ({ unitPrice: i.price, quantity: i.quantity })),
    discountType: discountValue > 0 ? discountType : null,
    discountValue,
    taxRate,
  });

  const notifyAdd = (p: ProductDTO, result: AddResult) => {
    if (result.ok) return true;
    if (result.reason === 'OUT_OF_STOCK') toast.error(`"${p.name}" is out of stock.`);
    else toast.warning(`Insufficient stock for "${p.name}". Only ${result.available} ${p.unit} available.`);
    return false;
  };

  const addProduct = (p: ProductDTO) => notifyAdd(p, cart.add(p));

  const handleCode = async (code: string) => {
    const value = code.trim();
    if (!value) return;
    try {
      const product = await productsApi.lookup(value);
      if (addProduct(product)) {
        toast.success(`Added ${product.name}`, { duration: 1200 });
        setSearch('');
      }
    } catch (err) {
      // Not an exact barcode/SKU: if the search shows exactly one product, add it.
      const list = products.data?.data ?? [];
      if (err instanceof ApiError && err.status === 404 && debouncedSearch === value && list.length === 1) {
        if (addProduct(list[0])) setSearch('');
        return;
      }
      toast.error(errorMessage(err, 'Product lookup failed.'));
    }
  };

  // Scanner input while focus is outside a text field
  useBarcodeScanner(handleCode, !paymentOpen && !completed && !cameraOpen);

  const openPayment = () => {
    if (cart.items.length === 0) {
      toast.info('Add products to the cart first.');
      return;
    }
    setPaymentOpen(true);
  };

  useHotkeys({
    F2: () => {
      searchRef.current?.focus();
      searchRef.current?.select();
    },
    F4: () => !completed && openPayment(),
  });

  const refreshCart = async () => {
    try {
      const fresh = await Promise.all(cart.items.map((i) => productsApi.get(i.productId).catch(() => null)));
      cart.sync(fresh.filter((p): p is ProductDTO => !!p));
      queryClient.invalidateQueries({ queryKey: ['pos-products'] });
    } catch {
      /* the error message is already shown in the payment dialog */
    }
  };

  const onPaid = (t: TransactionDTO) => {
    setPaymentOpen(false);
    setCompleted(t);
    cart.clear();
    resetDiscount();
    queryClient.invalidateQueries({ queryKey: ['pos-products'] });
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
  };

  const newTransaction = () => {
    setCompleted(null);
    setTimeout(() => searchRef.current?.focus(), 50);
  };

  const order = {
    items: cart.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
    discountType: discountValue > 0 ? discountType : null,
    discountValue,
  };

  return (
    <div className="flex flex-col lg:h-full lg:flex-row">
      {/* ------------------------------------------------ Products */}
      <section className="flex min-h-0 flex-1 flex-col lg:overflow-hidden">
        <div className="space-y-3 border-b bg-card p-3 sm:p-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <ScanBarcode className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchRef}
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCode(search);
                  } else if (e.key === 'Escape' && search) {
                    e.stopPropagation();
                    setSearch('');
                  }
                }}
                placeholder="Scan barcode or search name / SKU…  (F2)"
                aria-label="Scan barcode or search products"
                className="h-11 pl-10 pr-9 text-base"
              />
              {search && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <Button variant="outline" size="icon" className="size-11" aria-label="Scan with camera" onClick={() => setCameraOpen(true)}>
              <Camera className="size-5" />
            </Button>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            <CategoryChip active={categoryId === null} onClick={() => setCategoryId(null)}>
              All
            </CategoryChip>
            {categories?.map((c) => (
              <CategoryChip key={c.id} active={categoryId === c.id} onClick={() => setCategoryId(c.id)}>
                {c.name}
              </CategoryChip>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          {products.isLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {Array.from({ length: 10 }, (_, i) => (
                <Skeleton key={i} className="h-52" />
              ))}
            </div>
          ) : products.isError ? (
            <ErrorState message={errorMessage(products.error)} onRetry={() => products.refetch()} />
          ) : products.data?.data.length === 0 ? (
            <EmptyState title="No products found" description="Try a different search or category." />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {products.data?.data.map((p) => {
                const inCart = cart.items.find((i) => i.productId === p.id)?.quantity ?? 0;
                const out = p.stock <= 0;
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={out}
                    onClick={() => addProduct(p)}
                    className={cn(
                      'group relative flex flex-col overflow-hidden rounded-xl border bg-card text-left shadow-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      out ? 'cursor-not-allowed opacity-55' : 'hover:border-primary/50 hover:shadow-md active:scale-[0.98]',
                      inCart > 0 && 'border-primary ring-1 ring-primary',
                    )}
                  >
                    {inCart > 0 && (
                      <span className="absolute right-2 top-2 z-10 flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-white shadow">
                        {inCart}
                      </span>
                    )}
                    <ProductThumb src={p.imageUrl} name={p.name} className="aspect-video w-full rounded-none sm:aspect-[4/3]" />
                    <div className="flex flex-1 flex-col gap-1 p-2.5">
                      <p className="line-clamp-2 text-sm font-medium leading-snug">{p.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {p.sku}
                        {p.category ? ` · ${p.category.name}` : ''}
                      </p>
                      <div className="mt-auto flex items-end justify-between gap-1 pt-1">
                        <span className="font-semibold text-primary">{formatRupiah(p.sellingPrice)}</span>
                        <span className="text-xs text-muted-foreground">
                          {p.stock} {p.unit}
                        </span>
                      </div>
                      {p.stockStatus !== 'IN_STOCK' && (
                        <div>
                          <StockBadge status={p.stockStatus} />
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {products.data && products.data.totalPages > 1 && (
          <div className="bg-card">
            <Pagination
              page={products.data.page}
              totalPages={products.data.totalPages}
              total={products.data.total}
              pageSize={products.data.pageSize}
              onPageChange={setPage}
            />
          </div>
        )}
      </section>

      {/* ------------------------------------------------ Cart */}
      <aside
        id="cart"
        className="flex flex-col border-t bg-card lg:w-[380px] lg:border-l lg:border-t-0 xl:w-[420px]"
        aria-label="Shopping cart"
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="flex items-center gap-2 font-semibold">
            <ShoppingCart className="size-5" /> Cart
            {totals.itemCount > 0 && <span className="text-sm font-normal text-muted-foreground">({totals.itemCount} items)</span>}
          </h2>
          {cart.items.length > 0 && (
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setClearOpen(true)}>
              <Trash2 /> Clear
            </Button>
          )}
        </div>

        <div className="min-h-[160px] flex-1 overflow-y-auto">
          {cart.items.length === 0 ? (
            <EmptyState icon={ShoppingCart} title="Cart is empty" description="Scan a barcode or tap a product to add it." />
          ) : (
            <ul className="divide-y">
              {cart.items.map((item) => (
                <li key={item.productId} className="flex gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatRupiah(item.price)} / {item.unit}
                    </p>
                    <div className="mt-2 flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon-sm"
                        aria-label={`Decrease ${item.name}`}
                        onClick={() => cart.setQuantity(item.productId, item.quantity - 1)}
                      >
                        <Minus />
                      </Button>
                      <Input
                        aria-label={`Quantity of ${item.name}`}
                        inputMode="numeric"
                        className="h-8 w-14 text-center"
                        value={item.quantity}
                        onChange={(e) => {
                          const n = Number(e.target.value.replace(/\D/g, ''));
                          if (n > item.stock) toast.warning(`Only ${item.stock} ${item.unit} of "${item.name}" in stock.`);
                          cart.setQuantity(item.productId, Math.max(1, n || 1));
                        }}
                        onFocus={(e) => e.target.select()}
                      />
                      <Button
                        variant="outline"
                        size="icon-sm"
                        aria-label={`Increase ${item.name}`}
                        onClick={() => {
                          if (item.quantity >= item.stock) {
                            toast.warning(`Only ${item.stock} ${item.unit} of "${item.name}" in stock.`);
                            return;
                          }
                          cart.setQuantity(item.productId, item.quantity + 1);
                        }}
                      >
                        <Plus />
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-col items-end justify-between">
                    <button
                      type="button"
                      aria-label={`Remove ${item.name}`}
                      onClick={() => cart.remove(item.productId)}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <X className="size-4" />
                    </button>
                    <span className="text-sm font-semibold">{formatRupiah(item.price * item.quantity)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-2.5 border-t bg-muted/30 px-4 py-3 text-sm">
          <Row label="Subtotal" value={formatRupiah(totals.subtotal)} />
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Discount</span>
            <div className="flex items-center gap-1.5">
              <Select
                aria-label="Discount type"
                className="h-8 w-[70px] px-2 pr-6 text-xs"
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as DiscountTypeValue)}
              >
                <option value="PERCENT">%</option>
                <option value="AMOUNT">Rp</option>
              </Select>
              <Input
                aria-label="Discount value"
                inputMode="decimal"
                className="h-8 w-24 text-right"
                value={discountValue || ''}
                placeholder="0"
                onChange={(e) => {
                  const n = Number(e.target.value.replace(/[^\d.]/g, ''));
                  if (!Number.isFinite(n)) return;
                  setDiscountValue(discountType === 'PERCENT' ? Math.min(n, 100) : Math.round(n));
                }}
              />
            </div>
          </div>
          {totals.discountAmount > 0 && <Row label="Discount amount" value={`-${formatRupiah(totals.discountAmount)}`} />}
          {taxRate > 0 && <Row label={`Tax (${taxRate}%)`} value={formatRupiah(totals.taxAmount)} />}
          <div className="flex items-center justify-between border-t pt-2.5">
            <span className="text-base font-semibold">Grand Total</span>
            <span className="text-2xl font-bold text-primary">{formatRupiah(totals.total)}</span>
          </div>
          <Button size="xl" className="w-full" onClick={openPayment} disabled={cart.items.length === 0}>
            PAY / CHECKOUT <kbd className="ml-1 rounded bg-white/20 px-1.5 text-sm font-normal">F4</kbd>
          </Button>
        </div>
      </aside>

      {/* ------------------------------------------------ Dialogs */}
      <PaymentDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        total={totals.total}
        order={order}
        onSuccess={onPaid}
        onCartOutdated={refreshCart}
      />

      <Dialog open={!!completed} onOpenChange={(o) => !o && newTransaction()}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-success">
              <CheckCircle2 className="size-6" /> Payment successful
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {completed && (
              <>
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="text-lg font-semibold">{formatRupiah(completed.total)}</p>
                  </div>
                  <div className="rounded-lg bg-success/10 p-3">
                    <p className="text-xs text-muted-foreground">Change</p>
                    <p className="text-lg font-bold text-success">{formatRupiah(completed.change)}</p>
                  </div>
                </div>
                {settings && <ReceiptPanel transaction={completed} settings={settings} autoFocusPrint />}
              </>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="lg" onClick={newTransaction}>
              New transaction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CameraScanner open={cameraOpen} onOpenChange={setCameraOpen} onDetected={handleCode} />

      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="Clear the cart?"
        description="All items will be removed from the current sale."
        confirmLabel="Clear cart"
        destructive
        onConfirm={() => {
          cart.clear();
          resetDiscount();
          setClearOpen(false);
        }}
      />

      {/* Mobile: sticky total bar that jumps to the cart */}
      {cart.items.length > 0 && (
        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t bg-card px-4 py-2.5 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] lg:hidden">
          <div>
            <p className="text-xs text-muted-foreground">{totals.itemCount} items</p>
            <p className="font-bold text-primary">{formatRupiah(totals.total)}</p>
          </div>
          <Button onClick={openPayment}>Pay now</Button>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function CategoryChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'shrink-0 rounded-full border px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'border-primary bg-primary text-white' : 'bg-card hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}
