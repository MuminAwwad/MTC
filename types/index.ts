import type {
  User,
  Customer,
  Supplier,
  Product,
  Category,
  Invoice,
  InvoiceItem,
  MaintenanceTicket,
  TicketPart,
  TicketUpdate,
  Debt,
  DebtPayment,
  Payable,
  PayablePayment,
  Expense,
  ExpenseCategory,
  StockMovement,
} from "@prisma/client";

// ─── Re-export Prisma types ───────────────────────────────────────────────────
export type {
  User,
  Customer,
  Supplier,
  Product,
  Category,
  Invoice,
  InvoiceItem,
  MaintenanceTicket,
  TicketPart,
  TicketUpdate,
  Debt,
  DebtPayment,
  Payable,
  PayablePayment,
  Expense,
  ExpenseCategory,
  StockMovement,
};

// ─── Extended types with relations ────────────────────────────────────────────

export type InvoiceWithDetails = Invoice & {
  customer: Customer;
  items: (InvoiceItem & { product: Product | null })[];
  createdBy: User | null;
};

export type TicketWithDetails = MaintenanceTicket & {
  customer: Customer;
  parts: (TicketPart & { product: Product | null })[];
  timeline: (TicketUpdate & { createdBy: User | null })[];
  createdBy: User | null;
};

export type DebtWithDetails = Debt & {
  customer: Customer;
  invoice: Invoice | null;
  payments: (DebtPayment & { createdBy: User | null })[];
};

export type PayableWithDetails = Payable & {
  supplier: Supplier;
  payments: (PayablePayment & { createdBy: User | null })[];
};

export type ProductWithDetails = Product & {
  category: Category | null;
  supplier: Supplier | null;
  stockMovements: StockMovement[];
};

export type CustomerWithStats = Customer & {
  _count: {
    invoices: number;
    maintenanceTickets: number;
    debts: number;
  };
};

// ─── API Response types ───────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─── Dashboard types ──────────────────────────────────────────────────────────

export interface DashboardStats {
  todayRevenue: number;
  currency: "ILS";
  openTickets: number;
  lowStockCount: number;
  totalOutstandingDebt: number;
}

export interface SalesChartData {
  date: string;
  total: number;
}

export interface CategorySalesData {
  name: string;
  value: number;
  color: string;
}

// ─── Form types ───────────────────────────────────────────────────────────────

export interface InvoiceFormItem {
  productId: string | null;
  name: string;
  qty: number;
  unitPrice: number;
  discount: number;
  total: number;
}

export interface InvoiceFormData {
  customerId: string;
  currency: "ILS" | "USD" | "JOD";
  discountPercent: number;
  discountAmount: number;
  taxPercent: number;
  notes: string;
  items: InvoiceFormItem[];
}

// ─── Filter types ─────────────────────────────────────────────────────────────

export interface DateRange {
  from: Date | null;
  to: Date | null;
}

export interface TableFilters {
  search?: string;
  page?: number;
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
}
