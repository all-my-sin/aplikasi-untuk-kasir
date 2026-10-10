import { zodResolver } from '@hookform/resolvers/zod';
import { type UserCreateInput, type UserDTO, passwordResetSchema, userCreateSchema, userUpdateSchema } from '@pos/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Pencil, Plus, Search, UserCheck, UserX, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, Input, Select, Switch } from '@/components/ui/form-controls';
import { Badge, Card, EmptyState, ErrorState, PageHeader, Pagination, Spinner, TBody, TD, TH, THead, TR, Table } from '@/components/ui/misc';
import { useDebounce } from '@/hooks/common';
import { useAuth } from '@/hooks/useAuth';
import { ApiError, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { usersApi } from '@/services';

export default function UsersPage() {
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<UserDTO | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [resetting, setResetting] = useState<UserDTO | null>(null);
  const debounced = useDebounce(search.trim());
  useEffect(() => setPage(1), [debounced, role]);

  const q = { search: debounced, role, page, pageSize: 20, isActive: 'all' };
  const list = useQuery({ queryKey: ['users', q], queryFn: () => usersApi.list(q), placeholderData: keepPreviousData });

  const status = useMutation({
    mutationFn: (u: UserDTO) => usersApi.setStatus(u.id, !u.isActive),
    onSuccess: (u) => {
      toast.success(`${u.name} ${u.isActive ? 'activated' : 'deactivated'}.`);
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['user-options'] });
    },
    onError: (err) => toast.error(errorMessage(err, 'Unable to change the user status.')),
  });

  return (
    <div>
      <PageHeader
        title="Users"
        description="Manage cashier and administrator accounts."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus /> New user
          </Button>
        }
      />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <div className="relative min-w-48 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search name, username, email…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select aria-label="Role" className="w-auto" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">All roles</option>
            <option value="ADMIN">Admin</option>
            <option value="CASHIER">Cashier</option>
          </Select>
        </div>
        {list.isLoading ? (
          <Spinner />
        ) : list.isError ? (
          <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
        ) : list.data?.data.length === 0 ? (
          <EmptyState icon={Users} title="No users found" />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Username</TH>
                  <TH>Email</TH>
                  <TH>Role</TH>
                  <TH>Status</TH>
                  <TH>Created</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {list.data?.data.map((u) => (
                  <TR key={u.id}>
                    <TD className="font-medium">
                      {u.name} {u.id === me?.id && <span className="text-xs text-muted-foreground">(you)</span>}
                    </TD>
                    <TD>{u.username}</TD>
                    <TD className="text-muted-foreground">{u.email ?? '—'}</TD>
                    <TD>
                      <Badge variant={u.role === 'ADMIN' ? 'default' : 'secondary'}>{u.role === 'ADMIN' ? 'Admin' : 'Cashier'}</Badge>
                    </TD>
                    <TD>{u.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="destructive">Inactive</Badge>}</TD>
                    <TD className="whitespace-nowrap text-muted-foreground">{formatDate(u.createdAt)}</TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Edit ${u.name}`}
                          onClick={() => {
                            setEditing(u);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil />
                        </Button>
                        <Button variant="ghost" size="icon-sm" aria-label={`Reset password of ${u.name}`} onClick={() => setResetting(u)}>
                          <KeyRound />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={u.isActive ? `Deactivate ${u.name}` : `Activate ${u.name}`}
                          disabled={u.id === me?.id || status.isPending}
                          onClick={() => status.mutate(u)}
                        >
                          {u.isActive ? <UserX /> : <UserCheck />}
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
      <UserFormDialog open={formOpen} onOpenChange={setFormOpen} user={editing} />
      <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} />
    </div>
  );
}

type CreateOut = z.output<typeof userCreateSchema>;

function UserFormDialog({ open, onOpenChange, user }: { open: boolean; onOpenChange: (o: boolean) => void; user: UserDTO | null }) {
  const queryClient = useQueryClient();
  const isEdit = !!user;
  // Editing doesn't change the password; a placeholder satisfies the shared schema.
  const {
    register,
    handleSubmit,
    reset,
    control,
    setError,
    formState: { errors },
  } = useForm<UserCreateInput, unknown, CreateOut>({ resolver: zodResolver(userCreateSchema) });

  useEffect(() => {
    if (!open) return;
    reset({
      name: user?.name ?? '',
      username: user?.username ?? '',
      email: user?.email ?? '',
      password: isEdit ? 'unchanged-password' : '',
      role: user?.role ?? 'CASHIER',
      isActive: user?.isActive ?? true,
    });
  }, [open, user, isEdit, reset]);

  const mutation = useMutation({
    mutationFn: (data: CreateOut) => {
      if (user) {
        const { password: _pw, ...rest } = data;
        void _pw;
        return usersApi.update(user.id, userUpdateSchema.parse(rest));
      }
      return usersApi.create(data);
    },
    onSuccess: (u) => {
      toast.success(isEdit ? `${u.name} updated.` : `${u.name} created.`);
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['user-options'] });
      onOpenChange(false);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'DUPLICATE') {
        const target = String(err.details?.target ?? '');
        setError(target.includes('email') ? 'email' : 'username', { message: err.message });
      } else toast.error(errorMessage(err, 'Unable to save the user.'));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit user' : 'New user'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" htmlFor="u-name" error={errors.name?.message} required className="sm:col-span-2">
              <Input id="u-name" autoFocus aria-invalid={!!errors.name} {...register('name')} />
            </Field>
            <Field label="Username" htmlFor="u-username" error={errors.username?.message} required>
              <Input id="u-username" autoComplete="off" aria-invalid={!!errors.username} {...register('username')} />
            </Field>
            <Field label="Email" htmlFor="u-email" error={errors.email?.message}>
              <Input id="u-email" type="email" aria-invalid={!!errors.email} {...register('email')} />
            </Field>
            {!isEdit && (
              <Field label="Password" htmlFor="u-password" error={errors.password?.message} required hint="At least 8 characters">
                <Input id="u-password" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...register('password')} />
              </Field>
            )}
            <Field label="Role" htmlFor="u-role" error={errors.role?.message} required>
              <Select id="u-role" {...register('role')}>
                <option value="CASHIER">Cashier</option>
                <option value="ADMIN">Admin</option>
              </Select>
            </Field>
            <div className="flex items-center gap-3 sm:col-span-2">
              <Controller
                control={control}
                name="isActive"
                render={({ field }) => <Switch id="u-active" checked={!!field.value} onCheckedChange={field.onChange} label="Active" />}
              />
              <label htmlFor="u-active" className="text-sm">
                Active (can sign in)
              </label>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              {isEdit ? 'Save changes' : 'Create user'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ user, onClose }: { user: UserDTO | null; onClose: () => void }) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<{ password: string }>({ resolver: zodResolver(passwordResetSchema) });
  useEffect(() => {
    if (user) reset({ password: '' });
  }, [user, reset]);

  const mutation = useMutation({
    mutationFn: (password: string) => usersApi.resetPassword(user!.id, password),
    onSuccess: () => {
      toast.success(`Password reset for ${user?.name}. They have been signed out of other sessions.`);
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err, 'Unable to reset the password.')),
  });

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>Set a new password for {user?.name}.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d.password))} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogBody>
            <Field label="New password" htmlFor="new-pw" error={errors.password?.message} required hint="At least 8 characters">
              <Input id="new-pw" type="password" autoComplete="new-password" autoFocus {...register('password')} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              Reset password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
