// Typed API calls, grouped by domain.
import type {
  ActivityLogDTO,
  BestSellerDTO,
  CategoryDTO,
  CategoryInput,
  CheckoutInput,
  DailySalesDTO,
  DashboardDTO,
  InventoryAdjustmentInput,
  InventoryMovementDTO,
  Paginated,
  PaymentBreakdownDTO,
  ProductDTO,
  ProductImportRow,
  ProductInput,
  RoleValue,
  SalesSummaryDTO,
  SettingsInput,
  StockOpnameInput,
  StoreSettingsDTO,
  TransactionDTO,
  TransactionSummaryDTO,
  UserCreateInput,
  UserDTO,
  UserUpdateInput,
} from '@pos/shared';
import { api, downloadFile } from '@/lib/api';

type Q = Record<string, string | number | boolean | undefined | null>;

export const authApi = {
  login: (username: string, password: string) => api.post<{ user: UserDTO }>('/auth/login', { username, password }),
  logout: () => api.post<{ ok: true }>('/auth/logout'),
  me: () => api.get<{ user: UserDTO }>('/auth/me'),
};

export const productsApi = {
  list: (q: Q) => api.get<Paginated<ProductDTO>>('/products', q),
  get: (id: number) => api.get<ProductDTO>(`/products/${id}`),
  lookup: (code: string) => api.get<ProductDTO>('/products/lookup', { code }),
  create: (data: ProductInput) => api.post<ProductDTO>('/products', data),
  update: (id: number, data: Omit<ProductInput, 'stock'>) => api.put<ProductDTO>(`/products/${id}`, data),
  archive: (id: number) => api.delete<ProductDTO>(`/products/${id}`),
  exportCsv: (q: Q) => downloadFile('/products/export', q),
  importRows: (rows: ProductImportRow[]) =>
    api.post<{ created: number; updated: number; errors: { row: number; message: string }[] }>(
      '/products/import',
      { rows },
      { acceptStatus: [422] },
    ),
};

export const categoriesApi = {
  list: (q: Q = {}) => api.get<CategoryDTO[]>('/categories', q),
  create: (data: CategoryInput) => api.post<CategoryDTO>('/categories', data),
  update: (id: number, data: CategoryInput) => api.put<CategoryDTO>(`/categories/${id}`, data),
  remove: (id: number) => api.delete<void>(`/categories/${id}`),
};

export const inventoryApi = {
  list: (q: Q) => api.get<Paginated<ProductDTO>>('/inventory', q),
  adjust: (data: InventoryAdjustmentInput) => api.post<InventoryMovementDTO>('/inventory/adjustments', data),
  opname: (data: StockOpnameInput) => api.post<{ counted: number; corrected: number }>('/inventory/opname', data),
  movements: (q: Q) => api.get<Paginated<InventoryMovementDTO>>('/inventory/movements', q),
};

export const transactionsApi = {
  list: (q: Q) => api.get<Paginated<TransactionSummaryDTO> & { totalAmount: number }>('/transactions', q),
  get: (id: number) => api.get<TransactionDTO>(`/transactions/${id}`),
  checkout: (data: CheckoutInput) => api.post<TransactionDTO>('/transactions', data),
  void: (id: number, reason: string) => api.post<TransactionDTO>(`/transactions/${id}/void`, { reason }),
};

export interface SalesReport {
  summary: SalesSummaryDTO;
  daily: DailySalesDTO[];
  payments: PaymentBreakdownDTO[];
  cashiers: { cashierId: number; name: string; transactions: number; revenue: number }[];
}

export const reportsApi = {
  dashboard: (q: Q) => api.get<DashboardDTO>('/reports/dashboard', q),
  sales: (q: Q) => api.get<SalesReport>('/reports/sales', q),
  bestSellers: (q: Q) => api.get<BestSellerDTO[]>('/reports/products', q),
  export: (q: Q) => downloadFile('/reports/export', q),
};

export const usersApi = {
  list: (q: Q) => api.get<Paginated<UserDTO>>('/users', q),
  options: () => api.get<{ id: number; name: string; role: RoleValue }[]>('/users/options'),
  create: (data: UserCreateInput) => api.post<UserDTO>('/users', data),
  update: (id: number, data: UserUpdateInput) => api.put<UserDTO>(`/users/${id}`, data),
  setStatus: (id: number, isActive: boolean) => api.patch<UserDTO>(`/users/${id}/status`, { isActive }),
  resetPassword: (id: number, password: string) => api.patch<{ ok: true }>(`/users/${id}/password`, { password }),
};

export const settingsApi = {
  get: () => api.get<StoreSettingsDTO>('/settings'),
  update: (data: SettingsInput) => api.put<StoreSettingsDTO>('/settings', data),
};

export const uploadsApi = {
  image: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<{ url: string }>('/uploads', form);
  },
};

export const activityApi = {
  list: (q: Q) => api.get<Paginated<ActivityLogDTO>>('/activity-logs', q),
};
