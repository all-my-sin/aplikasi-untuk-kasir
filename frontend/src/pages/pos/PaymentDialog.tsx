import {
  type CheckoutInput,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  type PaymentMethodValue,
  type TransactionDTO,
  calculateChange,
  formatNumber,
  formatRupiah,
} from '@pos/shared';
import { useMutation } from '@tanstack/react-query';
import { Banknote, CreditCard, Landmark, QrCode, WalletCards } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/form-controls';
import { ApiError, errorMessage } from '@/lib/api';
import { cn, newClientRef, parseAmount } from '@/lib/utils';
import { transactionsApi } from '@/services';

const METHOD_ICONS: Record<PaymentMethodValue, typeof Banknote> = {
  CASH: Banknote,
  BANK_TRANSFER: Landmark,
  QRIS: QrCode,
  DEBIT_CARD: WalletCards,
  CREDIT_CARD: CreditCard,
};

/** Quick cash buttons: exact amount + the next round banknote amounts. */
function quickAmounts(total: number): number[] {
  const steps = [5000, 10000, 20000, 50000, 100000];
  const set = new Set<number>([total]);
  for (const s of steps) {
    const v = Math.ceil(total / s) * s;
    if (v > total) set.add(v);
  }
  return [...set].sort((a, b) => a - b).slice(0, 5);
}

interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  total: number;
  order: Omit<CheckoutInput, 'payment' | 'clientRef' | 'expectedTotal'>;
  onSuccess: (transaction: TransactionDTO) => void;
  /** Called when the server says stock or prices changed, so the cart can refresh. */
  onCartOutdated: () => void;
}

export function PaymentDialog({ open, onOpenChange, total, order, onSuccess, onCartOutdated }: PaymentDialogProps) {
  const [method, setMethod] = useState<PaymentMethodValue>('CASH');
  const [amountText, setAmountText] = useState('');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  // One idempotency key per payment attempt: retries after a network error can't double-charge.
  const clientRef = useRef(newClientRef());
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setMethod('CASH');
      setAmountText('');
      setReference('');
      setError(null);
      clientRef.current = newClientRef();
    }
  }, [open]);

  const amountPaid = method === 'CASH' ? parseAmount(amountText) : total;
  const change = Number.isFinite(amountPaid) ? calculateChange(total, amountPaid) : null;
  const insufficient = method === 'CASH' && (amountText === '' || change === null);

  const mutation = useMutation({
    mutationFn: () =>
      transactionsApi.checkout({
        ...order,
        clientRef: clientRef.current,
        expectedTotal: total,
        payment: { method, amount: amountPaid, reference: reference || null },
      }),
    onSuccess,
    onError: (err) => {
      setError(errorMessage(err, 'Unable to complete the payment. Please try again.'));
      if (err instanceof ApiError && ['INSUFFICIENT_STOCK', 'TOTAL_CHANGED', 'PRODUCT_INACTIVE', 'PRODUCT_NOT_FOUND'].includes(err.code ?? '')) {
        onCartOutdated();
      }
    },
  });

  const submit = () => {
    if (mutation.isPending) return;
    if (insufficient) {
      setError('Insufficient payment amount.');
      amountRef.current?.focus();
      return;
    }
    setError(null);
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !mutation.isPending && onOpenChange(o)}>
      <DialogContent size="md" onOpenAutoFocus={(e) => (e.preventDefault(), amountRef.current?.focus())}>
        <DialogHeader>
          <DialogTitle>Payment</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <DialogBody className="space-y-5">
            <div className="rounded-lg bg-primary/8 px-4 py-3 text-center">
              <p className="text-sm text-muted-foreground">Total to pay</p>
              <p className="text-3xl font-bold tracking-tight text-primary">{formatRupiah(total)}</p>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">Payment method</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" role="radiogroup" aria-label="Payment method">
                {PAYMENT_METHODS.map((m) => {
                  const Icon = METHOD_ICONS[m];
                  return (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={method === m}
                      onClick={() => {
                        setMethod(m);
                        setError(null);
                        if (m === 'CASH') setTimeout(() => amountRef.current?.focus(), 0);
                      }}
                      className={cn(
                        'flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        method === m ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted',
                      )}
                    >
                      <Icon className="size-5" />
                      {PAYMENT_METHOD_LABELS[m]}
                    </button>
                  );
                })}
              </div>
            </div>

            {method === 'CASH' ? (
              <div className="space-y-3">
                <Field label="Amount paid" htmlFor="amount-paid">
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-medium text-muted-foreground">
                      Rp
                    </span>
                    <Input
                      id="amount-paid"
                      ref={amountRef}
                      inputMode="numeric"
                      autoComplete="off"
                      className="h-12 pl-10 text-xl font-semibold"
                      value={amountText}
                      onChange={(e) => {
                        const n = parseAmount(e.target.value);
                        setAmountText(Number.isFinite(n) ? formatNumber(n) : '');
                        setError(null);
                      }}
                      placeholder="0"
                    />
                  </div>
                </Field>
                <div className="flex flex-wrap gap-2">
                  {quickAmounts(total).map((v, i) => (
                    <Button
                      key={v}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setAmountText(formatNumber(v));
                        setError(null);
                      }}
                    >
                      {i === 0 ? 'Exact' : formatRupiah(v)}
                    </Button>
                  ))}
                </div>
                {amountText !== '' && change === null ? (
                  <div className="flex items-center justify-between rounded-lg bg-destructive/10 px-4 py-3 text-destructive">
                    <span className="text-sm font-medium">Insufficient — short by</span>
                    <span className="text-2xl font-bold">{formatRupiah(total - amountPaid)}</span>
                  </div>
                ) : (
                  <div
                    className={cn(
                      'flex items-center justify-between rounded-lg px-4 py-3',
                      change === null ? 'bg-muted' : 'bg-success/10',
                    )}
                  >
                    <span className="text-sm font-medium">Change</span>
                    <span className={cn('text-2xl font-bold', change === null ? 'text-muted-foreground' : 'text-success')}>
                      {change === null ? '—' : formatRupiah(change)}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <Field label="Reference (optional)" htmlFor="pay-ref" hint="Approval code, transfer reference, etc.">
                <Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} />
              </Field>
            )}

            {error && (
              <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
              Cancel (Esc)
            </Button>
            <Button type="submit" size="lg" loading={mutation.isPending}>
              Complete payment (Enter)
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
