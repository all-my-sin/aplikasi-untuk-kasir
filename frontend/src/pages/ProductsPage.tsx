import { type ProductDTO, STOCK_STATUSES, STOCK_STATUS_LABELS, formatRupiah } from '@pos/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, ArrowUpDown, Download, Package, Pencil, Plus, Search, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ProductThumb, StockBadge } from '@/components/common';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input, Select } from '@/components/ui/form-controls';
import { Badge, Card, EmptyState, ErrorState, PageHeader, Pagination, Spinner, TBody, TD, TH, THead, TR, Table } from '@/components/ui/misc';
import { useCategories, useDebounce } from '@/hooks/common';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { productsApi } from '@/services';
import { ImportDialog } from './products/ImportDialog';
import { ProductFormDialog } from './products/ProductFormDialog';

type SortKey = 'name' | 'sellingPrice' | 'stock' | 'createdAt';

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const { data: categories } = useCategories(true);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [stockStatus, setStockStatus] = useState('');
  const [active, setActive] = useState<'true' | 'false' | 'all'>('true');
  const [sort, setSort] = useState<{ key: SortKey; order: 'asc' | 'desc' }>({ key: 'name', order: 'asc' });
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<ProductDTO | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [archiving, setArchiving] = useState<ProductDTO | null>(null);
  const [exporting, setExporting] = useState(false);
  const debounced = useDebounce(search.trim());

  useEffect(() => setPage(1), [debounced, categoryId, stockStatus, active, sort]);

  const filters = { search: debounced, categoryId, stockStatus, isActive: active };
  const query = { ...filters, sort: sort.key, order: sort.order, page, pageSize: 20 };
  const list = useQuery({
    queryKey: ['products', query],
    queryFn: () => productsApi.list(query),
    placeholderData: keepPreviousData,
  });

  const toggleActive = useMutation({
    mutationFn: async (p: ProductDTO) => {
      if (p.isActive) return productsApi.archive(p.id);
      const { id: _id, category: _c, stockStatus: _s, createdAt: _ca, updatedAt: _ua, stock: _st, ...rest } = p;
      void [_id, _c, _s, _ca, _ua, _st];
      return productsApi.update(p.id, { ...rest, purchasePrice: p.purchasePrice ?? 0, isActive: true });
    },
    onSuccess: (p) => {
      toast.success(p.isActive ? `"${p.name}" reactivated.` : `"${p.name}" archived.`);
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['pos-products'] });
      setArchiving(null);
    },
    onError: (err) => toast.error(errorMessage(err, 'Unable to update the product.')),
  });

  const exportCsv = async () => {
    setExporting(true);
    try {
      await productsApi.exportCsv(filters);
    } catch (err) {
      toast.error(errorMessage(err, 'Unable to export products.'));
    } finally {
      setExporting(false);
    }
  };

  const sortBy = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, order: s.order === 'asc' ? 'desc' : 'asc' } : { key, order: key === 'name' ? 'asc' : 'desc' }));

  const SortHead = ({ k, label, className }: { k: SortKey; label: string; className?: string }) => {
    const Icon = sort.key !== k ? ArrowUpDown : sort.order === 'asc' ? ArrowUp : ArrowDown;
    return (
      <TH className={className} aria-sort={sort.key === k ? (sort.order === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <button type="button" onClick={() => sortBy(k)} className="inline-flex items-center gap-1 uppercase hover:text-foreground">
          {label} <Icon className={cn('size-3.5', sort.key !== k && 'opacity-40')} />
        </button>
      </TH>
    );
  };

  return (
    <div>
      <PageHeader
        title="Products"
        description="Manage your product catalogue, prices and barcodes."
        actions={
          <>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload /> Import CSV
            </Button>
            <Button variant="outline" onClick={exportCsv} loading={exporting}>
              <Download /> Export CSV
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus /> New product
            </Button>
          </>
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <div className="relative min-w-48 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search name, SKU or barcode…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select aria-label="Category" className="w-auto" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">All categories</option>
            {categories?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select aria-label="Stock status" className="w-auto" value={stockStatus} onChange={(e) => setStockStatus(e.target.value)}>
            <option value="">Any stock</option>
            {STOCK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STOCK_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
          <Select aria-label="Status" className="w-auto" value={active} onChange={(e) => setActive(e.target.value as typeof active)}>
            <option value="true">Active</option>
            <option value="false">Archived</option>
            <option value="all">All</option>
          </Select>
        </div>

        {list.isLoading ? (
          <Spinner />
        ) : list.isError ? (
          <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
        ) : list.data?.data.length === 0 ? (
          <EmptyState icon={Package} title="No products found" description="Adjust the filters or create a new product." />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <SortHead k="name" label="Product" />
                  <TH>Category</TH>
                  <TH className="text-right">Purchase</TH>
                  <SortHead k="sellingPrice" label="Price" className="text-right" />
                  <SortHead k="stock" label="Stock" className="text-right" />
                  <TH>Status</TH>
                  <TH className="w-24 text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {list.data?.data.map((p) => (
                  <TR key={p.id} className={cn(!p.isActive && 'opacity-60')}>
                    <TD>
                      <div className="flex items-center gap-3">
                        <ProductThumb src={p.imageUrl} name={p.name} />
                        <div className="min-w-0">
                          <p className="font-medium">{p.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {p.sku}
                            {p.barcode ? ` · ${p.barcode}` : ''}
                          </p>
                        </div>
                      </div>
                    </TD>
                    <TD>{p.category?.name ?? <span className="text-muted-foreground">—</span>}</TD>
                    <TD className="text-right text-muted-foreground">{formatRupiah(p.purchasePrice ?? 0)}</TD>
                    <TD className="text-right font-medium">{formatRupiah(p.sellingPrice)}</TD>
                    <TD className="text-right">
                      <div className="flex flex-col items-end gap-1">
                        <span className="font-medium">
                          {p.stock} {p.unit}
                        </span>
                        <StockBadge status={p.stockStatus} />
                      </div>
                    </TD>
                    <TD>{p.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Archived</Badge>}</TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Edit ${p.name}`}
                          onClick={() => {
                            setEditing(p);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={p.isActive ? `Archive ${p.name}` : `Reactivate ${p.name}`}
                          onClick={() => (p.isActive ? setArchiving(p) : toggleActive.mutate(p))}
                        >
                          {p.isActive ? <Archive /> : <ArchiveRestore />}
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
      </Card>

      <ProductFormDialog open={formOpen} onOpenChange={setFormOpen} product={editing} />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <ConfirmDialog
        open={!!archiving}
        onOpenChange={(o) => !o && setArchiving(null)}
        title={`Archive "${archiving?.name}"?`}
        description="Archived products are hidden from the POS but kept for transaction history. You can reactivate them later."
        confirmLabel="Archive"
        destructive
        loading={toggleActive.isPending}
        onConfirm={() => archiving && toggleActive.mutate(archiving)}
      />
    </div>
  );
}
