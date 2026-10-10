// JSON shapes returned by the REST API (dates are ISO strings).
import type {
  MovementTypeValue,
  PaperSize,
  PaymentMethodValue,
  RoleValue,
  StockStatus,
  TransactionStatusValue,
} from './constants';

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface UserDTO {
  id: number;
  name: string;
  username: string;
  email: string | null;
  role: RoleValue;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryDTO {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
  productCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductDTO {
  id: number;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  categoryId: number | null;
  category: { id: number; name: string } | null;
  /** Omitted for cashiers. */
  purchasePrice?: number;
  sellingPrice: number;
  stock: number;
  minStock: number;
  unit: string;
  imageUrl: string | null;
  isActive: boolean;
  stockStatus: StockStatus;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryMovementDTO {
  id: number;
  productId: number;
  product: { id: number; name: string; sku: string };
  type: MovementTypeValue;
  quantityChange: number;
  previousStock: number;
  newStock: number;
  reason: string | null;
  user: { id: number; name: string } | null;
  transaction: { id: number; number: string } | null;
  createdAt: string;
}

export interface TransactionItemDTO {
  id: number;
  productId: number;
  productName: string;
  sku: string;
  unit: string;
  unitPrice: number;
  purchasePrice?: number;
  quantity: number;
  subtotal: number;
}

export interface PaymentDTO {
  id: number;
  method: PaymentMethodValue;
  amount: number;
  reference: string | null;
}

export interface TransactionSummaryDTO {
  id: number;
  number: string;
  status: TransactionStatusValue;
  cashier: { id: number; name: string };
  itemCount: number;
  total: number;
  paymentMethods: PaymentMethodValue[];
  createdAt: string;
}

export interface TransactionDTO {
  id: number;
  number: string;
  status: TransactionStatusValue;
  cashier: { id: number; name: string };
  subtotal: number;
  discountType: 'AMOUNT' | 'PERCENT' | null;
  discountValue: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  totalCost?: number;
  amountPaid: number;
  change: number;
  itemCount: number;
  note: string | null;
  createdAt: string;
  voidedAt: string | null;
  voidedBy: { id: number; name: string } | null;
  voidReason: string | null;
  items: TransactionItemDTO[];
  payments: PaymentDTO[];
}

export interface StoreSettingsDTO {
  storeName: string;
  logoUrl: string | null;
  address: string;
  phone: string;
  email: string;
  receiptHeader: string;
  receiptFooter: string;
  receiptPaperSize: PaperSize;
  receiptShowLogo: boolean;
  currency: string;
  taxEnabled: boolean;
  taxRate: number;
  defaultDiscountPercent: number;
  timezone: string;
  updatedAt: string;
}

export interface ActivityLogDTO {
  id: number;
  user: { id: number; name: string; username: string } | null;
  action: string;
  entity: string;
  entityId: string | null;
  description: string;
  createdAt: string;
}

export interface SalesSummaryDTO {
  transactions: number;
  itemsSold: number;
  grossSales: number;
  discounts: number;
  netSales: number;
  tax: number;
  totalCollected: number;
  cogs: number;
  itemProfit: number;
  grossProfit: number;
  margin: number;
  averageTransaction: number;
}

export interface DailySalesDTO {
  date: string; // YYYY-MM-DD in the requested timezone
  revenue: number;
  transactions: number;
  profit: number;
}

export interface BestSellerDTO {
  rank: number;
  productId: number;
  name: string;
  sku: string;
  quantity: number;
  revenue: number;
  profit: number;
}

export interface PaymentBreakdownDTO {
  method: PaymentMethodValue;
  transactions: number;
  amount: number;
}

export interface DashboardDTO {
  today: SalesSummaryDTO;
  totalProducts: number;
  lowStockCount: number;
  outOfStockCount: number;
  lowStockProducts: Pick<ProductDTO, 'id' | 'name' | 'sku' | 'stock' | 'minStock' | 'unit' | 'stockStatus'>[];
}
