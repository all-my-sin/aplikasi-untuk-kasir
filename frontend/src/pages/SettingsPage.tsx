import { zodResolver } from '@hookform/resolvers/zod';
import { type ReceiptData, type SettingsInput, type StoreSettingsDTO, calculateTotals, settingsSchema } from '@pos/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Save, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { ReceiptPreview } from '@/components/receipt';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Switch, Textarea } from '@/components/ui/form-controls';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, ErrorState, PageHeader, Spinner } from '@/components/ui/misc';
import { useSettings } from '@/hooks/common';
import { errorMessage } from '@/lib/api';
import { settingsApi, uploadsApi } from '@/services';

type SettingsOut = z.output<typeof settingsSchema>;

const TIMEZONES = ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura', 'Asia/Singapore', 'Asia/Kuala_Lumpur', 'Asia/Bangkok', 'UTC'];

function toForm(s: StoreSettingsDTO): SettingsInput {
  const { updatedAt: _u, ...rest } = s;
  void _u;
  return rest;
}

export default function SettingsPage() {
  const settings = useSettings();
  if (settings.isLoading) return <Spinner />;
  if (settings.isError || !settings.data)
    return <ErrorState message={errorMessage(settings.error)} onRetry={() => settings.refetch()} />;
  return <SettingsForm initial={settings.data} />;
}

function SettingsForm({ initial }: { initial: StoreSettingsDTO }) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<SettingsInput, unknown, SettingsOut>({ resolver: zodResolver(settingsSchema), defaultValues: toForm(initial) });

  useEffect(() => reset(toForm(initial)), [initial, reset]);

  const mutation = useMutation({
    mutationFn: (data: SettingsOut) => settingsApi.update(data),
    onSuccess: (s) => {
      queryClient.setQueryData(['settings'], s);
      toast.success('Settings saved.');
    },
    onError: (err) => toast.error(errorMessage(err, 'Unable to save settings.')),
  });

  const uploadLogo = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await uploadsApi.image(file);
      setValue('logoUrl', url, { shouldDirty: true });
    } catch (err) {
      toast.error(errorMessage(err, 'Unable to upload the logo.'));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const v = watch();
  const sampleItems = [
    { name: 'Bottled Water 600ml', quantity: 2, unitPrice: 3000, subtotal: 6000 },
    { name: 'Instant Noodles Fried', quantity: 3, unitPrice: 3500, subtotal: 10500 },
  ];
  const taxRate = v.taxEnabled ? Number(v.taxRate) || 0 : 0;
  const totals = calculateTotals({ items: sampleItems, taxRate });
  const paid = Math.ceil(totals.total / 10000) * 10000;
  const sample: ReceiptData = {
    store: { name: v.storeName || 'Store name', address: v.address, phone: v.phone, header: v.receiptHeader, footer: v.receiptFooter },
    number: 'INV-20261007-0001',
    date: new Date(),
    timezone: v.timezone,
    cashier: 'John',
    items: sampleItems,
    subtotal: totals.subtotal,
    discountAmount: 0,
    taxRate,
    taxAmount: totals.taxAmount,
    total: totals.total,
    payments: [{ method: 'CASH', amount: paid }],
    amountPaid: paid,
    change: paid - totals.total,
  };
  const num = { valueAsNumber: true } as const;

  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} noValidate>
      <PageHeader
        title="Settings"
        description="Store details, receipts, tax and defaults."
        actions={
          <Button type="submit" loading={mutation.isPending} disabled={!isDirty || uploading}>
            <Save /> Save settings
          </Button>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_auto]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Store</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-4 sm:col-span-2">
                <div className="flex size-16 items-center justify-center overflow-hidden rounded-lg border bg-muted">
                  {v.logoUrl ? <img src={v.logoUrl} alt="Store logo" className="size-full object-contain" /> : <ImagePlus className="size-6 text-muted-foreground" />}
                </div>
                <div className="flex flex-wrap gap-2">
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => uploadLogo(e.target.files?.[0])} />
                  <Button type="button" variant="outline" size="sm" loading={uploading} onClick={() => fileRef.current?.click()}>
                    <ImagePlus /> {v.logoUrl ? 'Change logo' : 'Upload logo'}
                  </Button>
                  {v.logoUrl && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setValue('logoUrl', null, { shouldDirty: true })}>
                      <Trash2 /> Remove
                    </Button>
                  )}
                </div>
              </div>
              <Field label="Store name" htmlFor="storeName" error={errors.storeName?.message} required>
                <Input id="storeName" {...register('storeName')} />
              </Field>
              <Field label="Phone number" htmlFor="phone" error={errors.phone?.message}>
                <Input id="phone" {...register('phone')} />
              </Field>
              <Field label="Address" htmlFor="address" error={errors.address?.message} className="sm:col-span-2">
                <Input id="address" {...register('address')} />
              </Field>
              <Field label="Email" htmlFor="email" error={errors.email?.message}>
                <Input id="email" type="email" {...register('email')} />
              </Field>
              <Field label="Time zone" htmlFor="timezone" error={errors.timezone?.message} hint="Used for transaction numbers and receipts">
                <Select id="timezone" {...register('timezone')}>
                  {[...new Set([v.timezone, ...TIMEZONES])].map((tz) => (
                    <option key={tz}>{tz}</option>
                  ))}
                </Select>
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Receipt</CardTitle>
              <CardDescription>Shown on printed thermal receipts</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Receipt header" htmlFor="receiptHeader" error={errors.receiptHeader?.message} hint="Extra line under the address (e.g. tax ID)">
                <Textarea id="receiptHeader" rows={2} {...register('receiptHeader')} />
              </Field>
              <Field label="Receipt footer" htmlFor="receiptFooter" error={errors.receiptFooter?.message}>
                <Textarea id="receiptFooter" rows={2} {...register('receiptFooter')} />
              </Field>
              <Field label="Default paper size" htmlFor="receiptPaperSize" error={errors.receiptPaperSize?.message}>
                <Select id="receiptPaperSize" {...register('receiptPaperSize')}>
                  <option value="58">58 mm (32 characters)</option>
                  <option value="80">80 mm (48 characters)</option>
                </Select>
              </Field>
              <div className="flex items-center gap-3 self-end pb-2">
                <Controller
                  control={control}
                  name="receiptShowLogo"
                  render={({ field }) => <Switch id="receiptShowLogo" checked={!!field.value} onCheckedChange={field.onChange} label="Print logo" />}
                />
                <label htmlFor="receiptShowLogo" className="text-sm">
                  Print logo on receipts
                </label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sales</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Currency" htmlFor="currency" error={errors.currency?.message} hint="Prices are formatted as Indonesian Rupiah">
                <Input id="currency" maxLength={3} {...register('currency')} />
              </Field>
              <Field label="Default discount (%)" htmlFor="defaultDiscountPercent" error={errors.defaultDiscountPercent?.message} hint="Applied to every new sale; 0 to disable">
                <Input id="defaultDiscountPercent" type="number" min={0} max={100} step="0.5" {...register('defaultDiscountPercent', num)} />
              </Field>
              <div className="flex items-center gap-3">
                <Controller
                  control={control}
                  name="taxEnabled"
                  render={({ field }) => <Switch id="taxEnabled" checked={!!field.value} onCheckedChange={field.onChange} label="Enable tax" />}
                />
                <label htmlFor="taxEnabled" className="text-sm">
                  Charge tax on sales
                </label>
              </div>
              <Field label="Tax rate (%)" htmlFor="taxRate" error={errors.taxRate?.message} hint="e.g. 11 for PPN 11%">
                <Input id="taxRate" type="number" min={0} max={100} step="0.5" disabled={!v.taxEnabled} {...register('taxRate', num)} />
              </Field>
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit xl:sticky xl:top-0">
          <CardHeader>
            <CardTitle>Receipt preview</CardTitle>
          </CardHeader>
          <CardContent>
            <ReceiptPreview data={sample} paperSize={v.receiptPaperSize ?? '58'} logoUrl={v.receiptShowLogo ? v.logoUrl : null} />
          </CardContent>
        </Card>
      </div>
    </form>
  );
}
