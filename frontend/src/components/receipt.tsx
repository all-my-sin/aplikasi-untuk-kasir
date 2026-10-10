import {
  type PaperSize,
  type ReceiptData,
  type StoreSettingsDTO,
  type TransactionDTO,
  buildReceiptLines,
} from '@pos/shared';
import { Printer } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Tabs } from '@/components/ui/misc';
import { PRINTABLE_WIDTH_MM, printReceipt } from '@/lib/print';

export function toReceiptData(t: TransactionDTO, settings: StoreSettingsDTO, reprint = false): ReceiptData {
  return {
    store: {
      name: settings.storeName,
      address: settings.address,
      phone: settings.phone,
      header: settings.receiptHeader,
      footer: settings.receiptFooter,
    },
    number: t.number,
    date: t.createdAt,
    timezone: settings.timezone,
    cashier: t.cashier.name,
    status: t.status,
    items: t.items.map((i) => ({ name: i.productName, quantity: i.quantity, unitPrice: i.unitPrice, subtotal: i.subtotal })),
    subtotal: t.subtotal,
    discountAmount: t.discountAmount,
    taxRate: t.taxRate,
    taxAmount: t.taxAmount,
    total: t.total,
    payments: t.payments.map((p) => ({ method: p.method, amount: p.amount })),
    amountPaid: t.amountPaid,
    change: t.change,
    reprint,
  };
}

/** On-screen thermal receipt preview at true paper width. */
export function ReceiptPreview({ data, paperSize, logoUrl }: { data: ReceiptData; paperSize: PaperSize; logoUrl?: string | null }) {
  const lines = buildReceiptLines(data, paperSize);
  return (
    <div className="flex justify-center overflow-x-auto rounded-lg bg-muted p-4">
      <div
        className="receipt-paper shadow-md"
        style={{
          width: `${PRINTABLE_WIDTH_MM[paperSize]}mm`,
          padding: `3mm ${paperSize === '58' ? 5 : 4}mm 6mm`,
          boxSizing: 'content-box',
          fontSize: '2.5mm',
        }}
      >
        {logoUrl && (
          <div className="mb-1.5 flex justify-center">
            <img src={logoUrl} alt="" className="max-h-[18mm] grayscale" style={{ maxWidth: `${PRINTABLE_WIDTH_MM[paperSize] * 0.6}mm` }} />
          </div>
        )}
        {lines.join('\n')}
      </div>
    </div>
  );
}

/** Preview with 58/80mm switch and a print button. */
export function ReceiptPanel({
  transaction,
  settings,
  reprint = false,
  autoFocusPrint = false,
}: {
  transaction: TransactionDTO;
  settings: StoreSettingsDTO;
  reprint?: boolean;
  autoFocusPrint?: boolean;
}) {
  const [paperSize, setPaperSize] = useState<PaperSize>(settings.receiptPaperSize);
  const [printing, setPrinting] = useState(false);
  const data = toReceiptData(transaction, settings, reprint);
  const logo = settings.receiptShowLogo ? settings.logoUrl : null;

  const print = async () => {
    setPrinting(true);
    try {
      await printReceipt(data, paperSize, logo);
    } catch {
      toast.error('Unable to open the print dialog. Please try again.');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs<PaperSize>
          value={paperSize}
          onChange={setPaperSize}
          tabs={[
            { value: '58', label: '58 mm' },
            { value: '80', label: '80 mm' },
          ]}
        />
        <Button onClick={print} loading={printing} autoFocus={autoFocusPrint}>
          <Printer /> {reprint ? 'Reprint receipt' : 'Print receipt'}
        </Button>
      </div>
      <ReceiptPreview data={data} paperSize={paperSize} logoUrl={logo} />
    </div>
  );
}
