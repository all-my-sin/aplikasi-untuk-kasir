import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ScrollText, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DateRangeFilter, type RangeState, resolveRange } from '@/components/common';
import { Input, Select } from '@/components/ui/form-controls';
import { Badge, Card, EmptyState, ErrorState, PageHeader, Pagination, Spinner, TBody, TD, TH, THead, TR, Table } from '@/components/ui/misc';
import { useDebounce } from '@/hooks/common';
import { errorMessage } from '@/lib/api';
import { rangeQuery } from '@/lib/dates';
import { formatDateTime } from '@/lib/utils';
import { activityApi, usersApi } from '@/services';

const ENTITIES = ['Product', 'Category', 'Inventory', 'Transaction', 'User', 'StoreSetting'];

export default function ActivityLogPage() {
  const [search, setSearch] = useState('');
  const [entity, setEntity] = useState('');
  const [userId, setUserId] = useState('');
  const [range, setRange] = useState<RangeState | null>(null);
  const [page, setPage] = useState(1);
  const debounced = useDebounce(search.trim());
  const resolved = range ? resolveRange(range) : null;
  useEffect(() => setPage(1), [debounced, entity, userId, range]);

  const users = useQuery({ queryKey: ['user-options'], queryFn: usersApi.options, staleTime: 60_000 });
  const q = { search: debounced, entity, userId, page, pageSize: 30, ...(resolved ? rangeQuery(resolved) : {}) };
  const list = useQuery({ queryKey: ['activity', q], queryFn: () => activityApi.list(q), placeholderData: keepPreviousData });

  return (
    <div>
      <PageHeader title="Activity Log" description="Audit trail of important actions in the system." />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <div className="relative min-w-48 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search descriptions…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select aria-label="Entity" className="w-auto" value={entity} onChange={(e) => setEntity(e.target.value)}>
            <option value="">All areas</option>
            {ENTITIES.map((e) => (
              <option key={e} value={e}>
                {e === 'StoreSetting' ? 'Settings' : e}
              </option>
            ))}
          </Select>
          <Select aria-label="User" className="w-auto" value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">All users</option>
            {users.data?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
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
          <EmptyState icon={ScrollText} title="No activity found" />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Time</TH>
                  <TH>User</TH>
                  <TH>Action</TH>
                  <TH>Description</TH>
                </TR>
              </THead>
              <TBody>
                {list.data?.data.map((a) => (
                  <TR key={a.id}>
                    <TD className="whitespace-nowrap text-muted-foreground">{formatDateTime(a.createdAt)}</TD>
                    <TD className="whitespace-nowrap">{a.user?.name ?? 'System'}</TD>
                    <TD>
                      <Badge variant="secondary" className="font-mono text-[11px]">
                        {a.action}
                      </Badge>
                    </TD>
                    <TD>{a.description}</TD>
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
    </div>
  );
}
