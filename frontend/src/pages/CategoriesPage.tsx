import { zodResolver } from '@hookform/resolvers/zod';
import { type CategoryData, type CategoryDTO, type CategoryInput, categorySchema } from '@pos/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, Input, Switch, Textarea } from '@/components/ui/form-controls';
import { Badge, Card, EmptyState, ErrorState, PageHeader, Spinner, TBody, TD, TH, THead, TR, Table } from '@/components/ui/misc';
import { ApiError, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { categoriesApi } from '@/services';

export default function CategoriesPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<CategoryDTO | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<CategoryDTO | null>(null);

  const list = useQuery({ queryKey: ['categories', 'admin'], queryFn: () => categoriesApi.list({ isActive: 'all' }) });

  const remove = useMutation({
    mutationFn: (id: number) => categoriesApi.remove(id),
    onSuccess: () => {
      toast.success('Category deleted.');
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setDeleting(null);
    },
    onError: (err) => {
      toast.error(errorMessage(err, 'Unable to delete the category.'));
      setDeleting(null);
    },
  });

  return (
    <div>
      <PageHeader
        title="Categories"
        description="Group products to make them easier to find."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus /> New category
          </Button>
        }
      />
      <Card>
        {list.isLoading ? (
          <Spinner />
        ) : list.isError ? (
          <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
        ) : !list.data?.length ? (
          <EmptyState icon={Tags} title="No categories yet" description="Create your first category." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Description</TH>
                <TH className="text-right">Products</TH>
                <TH>Status</TH>
                <TH>Updated</TH>
                <TH className="w-24 text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {list.data.map((c) => (
                <TR key={c.id}>
                  <TD className="font-medium">{c.name}</TD>
                  <TD className="max-w-xs truncate text-muted-foreground">{c.description || '—'}</TD>
                  <TD className="text-right">{c.productCount}</TD>
                  <TD>{c.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</TD>
                  <TD className="whitespace-nowrap text-muted-foreground">{formatDate(c.updatedAt)}</TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit ${c.name}`}
                        onClick={() => {
                          setEditing(c);
                          setFormOpen(true);
                        }}
                      >
                        <Pencil />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={`Delete ${c.name}`} onClick={() => setDeleting(c)}>
                        <Trash2 />
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <CategoryFormDialog open={formOpen} onOpenChange={setFormOpen} category={editing} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete "${deleting?.name}"?`}
        description={
          deleting?.productCount
            ? `This category has ${deleting.productCount} product(s). Move them first, or deactivate the category instead.`
            : 'This cannot be undone.'
        }
        confirmLabel="Delete"
        destructive
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </div>
  );
}

function CategoryFormDialog({
  open,
  onOpenChange,
  category,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  category: CategoryDTO | null;
}) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    control,
    setError,
    formState: { errors },
  } = useForm<CategoryInput, unknown, CategoryData>({ resolver: zodResolver(categorySchema) });

  useEffect(() => {
    if (open) reset({ name: category?.name ?? '', description: category?.description ?? '', isActive: category?.isActive ?? true });
  }, [open, category, reset]);

  const mutation = useMutation({
    mutationFn: (data: CategoryData) => (category ? categoriesApi.update(category.id, data) : categoriesApi.create(data)),
    onSuccess: () => {
      toast.success(category ? 'Category updated.' : 'Category created.');
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      onOpenChange(false);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'DUPLICATE') setError('name', { message: err.message });
      else toast.error(errorMessage(err, 'Unable to save the category.'));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{category ? 'Edit category' : 'New category'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="space-y-4">
            <Field label="Name" htmlFor="cat-name" error={errors.name?.message} required>
              <Input id="cat-name" autoFocus aria-invalid={!!errors.name} {...register('name')} />
            </Field>
            <Field label="Description" htmlFor="cat-desc" error={errors.description?.message}>
              <Textarea id="cat-desc" rows={2} {...register('description')} />
            </Field>
            <div className="flex items-center gap-3">
              <Controller
                control={control}
                name="isActive"
                render={({ field }) => <Switch id="cat-active" checked={!!field.value} onCheckedChange={field.onChange} label="Active" />}
              />
              <label htmlFor="cat-active" className="text-sm">
                Active
              </label>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
