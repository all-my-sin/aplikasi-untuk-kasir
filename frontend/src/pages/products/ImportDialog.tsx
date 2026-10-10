import { type ProductImportRow, UTF8_BOM, parseCsvObjects, toCsv } from '@pos/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, FileUp } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { errorMessage } from '@/lib/api';
import { productsApi } from '@/services';

// CSV headers are matched case-insensitively; a few common aliases are accepted.
const HEADER_MAP: Record<string, keyof ProductImportRow> = {
  sku: 'sku',
  barcode: 'barcode',
  name: 'name',
  'product name': 'name',
  description: 'description',
  category: 'category',
  purchaseprice: 'purchasePrice',
  'purchase price': 'purchasePrice',
  cost: 'purchasePrice',
  sellingprice: 'sellingPrice',
  'selling price': 'sellingPrice',
  price: 'sellingPrice',
  stock: 'stock',
  minstock: 'minStock',
  'minimum stock': 'minStock',
  'min stock': 'minStock',
  unit: 'unit',
  isactive: 'isActive',
  active: 'isActive',
};

function toRows(text: string): ProductImportRow[] {
  return parseCsvObjects(text).map((obj) => {
    const row: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      const key = HEADER_MAP[k];
      if (key) row[key] = v;
    }
    return { sku: '', name: '', purchasePrice: '', sellingPrice: '', ...row } as ProductImportRow;
  });
}

function downloadTemplate() {
  const csv = toCsv(
    ['sku', 'barcode', 'name', 'description', 'category', 'purchasePrice', 'sellingPrice', 'stock', 'minStock', 'unit', 'isActive'],
    [['BEV-100', '8990000000001', 'Mineral Water 330ml', '', 'Beverages', 1800, 2500, 48, 12, 'bottle', 'true']],
  );
  const url = URL.createObjectURL(new Blob([UTF8_BOM + csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'product-import-template.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<ProductImportRow[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [errors, setErrors] = useState<{ row: number; message: string }[]>([]);

  const reset = () => {
    setRows(null);
    setFileName('');
    setErrors([]);
  };

  const mutation = useMutation({
    mutationFn: () => productsApi.importRows(rows ?? []),
    onSuccess: (res) => {
      if (res.errors.length) {
        setErrors(res.errors);
        toast.error('The file has errors. Nothing was imported.');
        return;
      }
      toast.success(`Import complete: ${res.created} created, ${res.updated} updated.`);
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      reset();
      onOpenChange(false);
    },
    onError: (err) => toast.error(errorMessage(err, 'Unable to import products.')),
  });

  const onFile = async (file: File | undefined) => {
    setErrors([]);
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      toast.error('The file is too large (maximum 4 MB).');
      return;
    }
    const parsed = toRows(await file.text());
    if (parsed.length === 0) {
      toast.error('No rows found. Make sure the first line contains column headers.');
      return;
    }
    setFileName(file.name);
    setRows(parsed);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Import products from CSV</DialogTitle>
          <DialogDescription>
            Existing products are matched by SKU and updated; new SKUs are created. Categories are created automatically.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <Button variant="link" className="h-auto p-0" onClick={downloadTemplate}>
            <Download /> Download CSV template
          </Button>
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center hover:bg-muted/40">
            <FileUp className="size-8 text-muted-foreground" />
            <span className="text-sm font-medium">{fileName || 'Choose a CSV file'}</span>
            <span className="text-xs text-muted-foreground">Columns: sku, name, purchasePrice, sellingPrice (required), barcode, category, stock, minStock, unit, isActive</span>
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>

          {rows && (
            <div className="rounded-lg border">
              <p className="border-b px-3 py-2 text-sm font-medium">{rows.length} rows ready to import (first 5 shown)</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/60">
                    <tr>
                      {['SKU', 'Name', 'Category', 'Purchase', 'Selling', 'Stock'].map((h) => (
                        <th key={h} className="px-2 py-1.5 text-left font-semibold">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 5).map((r, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-2 py-1">{r.sku}</td>
                        <td className="px-2 py-1">{r.name}</td>
                        <td className="px-2 py-1">{r.category}</td>
                        <td className="px-2 py-1">{String(r.purchasePrice)}</td>
                        <td className="px-2 py-1">{String(r.sellingPrice)}</td>
                        <td className="px-2 py-1">{String(r.stock ?? '')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {errors.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <p className="mb-1 font-medium text-destructive">Fix these rows and try again:</p>
              <ul className="space-y-0.5">
                {errors.map((e, i) => (
                  <li key={i}>
                    Row {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!rows} loading={mutation.isPending} onClick={() => mutation.mutate()}>
            Import {rows ? `${rows.length} rows` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
