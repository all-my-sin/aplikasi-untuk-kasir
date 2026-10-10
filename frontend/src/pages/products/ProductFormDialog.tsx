import { zodResolver } from '@hookform/resolvers/zod';
import { type ProductData, type ProductDTO, type ProductInput, productSchema } from '@pos/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { ProductThumb } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, Input, Select, Switch, Textarea } from '@/components/ui/form-controls';
import { useCategories } from '@/hooks/common';
import { ApiError, errorMessage } from '@/lib/api';
import { productsApi, uploadsApi } from '@/services';

const EMPTY: ProductInput = {
  sku: '',
  barcode: '',
  name: '',
  description: '',
  categoryId: null,
  purchasePrice: 0,
  sellingPrice: 0,
  stock: 0,
  minStock: 0,
  unit: 'pcs',
  imageUrl: null,
  isActive: true,
};

export function ProductFormDialog({
  open,
  onOpenChange,
  product,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductDTO | null;
}) {
  const queryClient = useQueryClient();
  const { data: categories } = useCategories(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const isEdit = !!product;

  const form = useForm<ProductInput, unknown, ProductData>({ resolver: zodResolver(productSchema), defaultValues: EMPTY });
  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    watch,
    setError,
    formState: { errors },
  } = form;

  useEffect(() => {
    if (!open) return;
    reset(
      product
        ? {
            sku: product.sku,
            barcode: product.barcode ?? '',
            name: product.name,
            description: product.description ?? '',
            categoryId: product.categoryId,
            purchasePrice: product.purchasePrice ?? 0,
            sellingPrice: product.sellingPrice,
            stock: product.stock,
            minStock: product.minStock,
            unit: product.unit,
            imageUrl: product.imageUrl,
            isActive: product.isActive,
          }
        : EMPTY,
    );
  }, [open, product, reset]);

  const mutation = useMutation({
    mutationFn: (data: ProductData) => {
      if (product) {
        const { stock: _stock, ...rest } = data;
        void _stock;
        return productsApi.update(product.id, rest);
      }
      return productsApi.create(data);
    },
    onSuccess: (p) => {
      toast.success(isEdit ? `"${p.name}" updated.` : `"${p.name}" created.`);
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['pos-products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      onOpenChange(false);
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        // Show server-side validation / uniqueness errors next to the right field
        if (err.fields) for (const [k, msg] of Object.entries(err.fields)) setError(k as keyof ProductInput, { message: msg });
        const target = String(err.details?.target ?? '');
        if (err.code === 'DUPLICATE' && target.includes('sku')) setError('sku', { message: err.message });
        if (err.code === 'DUPLICATE' && target.includes('barcode')) setError('barcode', { message: err.message });
      }
      toast.error(errorMessage(err, 'Unable to save the product. Please try again.'));
    },
  });

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await uploadsApi.image(file);
      setValue('imageUrl', url, { shouldDirty: true });
    } catch (err) {
      toast.error(errorMessage(err, 'Unable to upload the image.'));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const imageUrl = watch('imageUrl');
  const num = { valueAsNumber: true } as const;

  return (
    <Dialog open={open} onOpenChange={(o) => !mutation.isPending && onOpenChange(o)}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit product' : 'New product'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="flex min-h-0 flex-1 flex-col" noValidate>
          <DialogBody className="space-y-4">
            <div className="flex items-center gap-4">
              <ProductThumb src={imageUrl ?? null} name="Product image" className="size-20" />
              <div className="flex flex-wrap gap-2">
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => onUpload(e.target.files?.[0])} />
                <Button type="button" variant="outline" size="sm" loading={uploading} onClick={() => fileRef.current?.click()}>
                  <ImagePlus /> {imageUrl ? 'Change image' : 'Upload image'}
                </Button>
                {imageUrl && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setValue('imageUrl', null, { shouldDirty: true })}>
                    <Trash2 /> Remove
                  </Button>
                )}
                <p className="w-full text-xs text-muted-foreground">PNG, JPG, WEBP or GIF, max 2 MB.</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Product name" htmlFor="name" error={errors.name?.message} required className="sm:col-span-2">
                <Input id="name" aria-invalid={!!errors.name} {...register('name')} autoFocus />
              </Field>
              <Field label="SKU" htmlFor="sku" error={errors.sku?.message} required>
                <Input id="sku" aria-invalid={!!errors.sku} {...register('sku')} />
              </Field>
              <Field label="Barcode" htmlFor="barcode" error={errors.barcode?.message} hint="Scan or type the product barcode">
                <Input id="barcode" aria-invalid={!!errors.barcode} {...register('barcode')} />
              </Field>
              <Field label="Category" htmlFor="categoryId" error={errors.categoryId?.message}>
                <Controller
                  control={control}
                  name="categoryId"
                  render={({ field }) => (
                    <Select id="categoryId" value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}>
                      <option value="">Uncategorised</option>
                      {categories?.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                          {c.isActive ? '' : ' (inactive)'}
                        </option>
                      ))}
                    </Select>
                  )}
                />
              </Field>
              <Field label="Unit" htmlFor="unit" error={errors.unit?.message} required hint="e.g. pcs, pack, bottle, kg">
                <Input id="unit" aria-invalid={!!errors.unit} {...register('unit')} />
              </Field>
              <Field label="Purchase price (Rp)" htmlFor="purchasePrice" error={errors.purchasePrice?.message} required>
                <Input id="purchasePrice" type="number" min={0} step={1} aria-invalid={!!errors.purchasePrice} {...register('purchasePrice', num)} />
              </Field>
              <Field label="Selling price (Rp)" htmlFor="sellingPrice" error={errors.sellingPrice?.message} required>
                <Input id="sellingPrice" type="number" min={0} step={1} aria-invalid={!!errors.sellingPrice} {...register('sellingPrice', num)} />
              </Field>
              <Field
                label={isEdit ? 'Current stock' : 'Opening stock'}
                htmlFor="stock"
                error={errors.stock?.message}
                hint={isEdit ? 'Change stock from the Inventory page so it is recorded' : undefined}
              >
                <Input id="stock" type="number" min={0} step={1} disabled={isEdit} aria-invalid={!!errors.stock} {...register('stock', num)} />
              </Field>
              <Field label="Minimum stock" htmlFor="minStock" error={errors.minStock?.message} hint="Low-stock alert threshold">
                <Input id="minStock" type="number" min={0} step={1} aria-invalid={!!errors.minStock} {...register('minStock', num)} />
              </Field>
              <Field label="Description" htmlFor="description" error={errors.description?.message} className="sm:col-span-2">
                <Textarea id="description" rows={2} {...register('description')} />
              </Field>
              <div className="flex items-center gap-3 sm:col-span-2">
                <Controller
                  control={control}
                  name="isActive"
                  render={({ field }) => <Switch id="isActive" checked={!!field.value} onCheckedChange={field.onChange} label="Active" />}
                />
                <label htmlFor="isActive" className="text-sm">
                  Active (available for sale)
                </label>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={mutation.isPending} disabled={uploading}>
              {isEdit ? 'Save changes' : 'Create product'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
