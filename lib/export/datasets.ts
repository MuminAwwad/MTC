import { prisma } from "@/lib/prisma";
import {
  INVOICE_STATUS_LABELS,
  DEBT_STATUS_LABELS,
  TICKET_STATUS_LABELS,
  TICKET_PRIORITY_LABELS,
  DEVICE_TYPE_LABELS,
} from "@/lib/constants";
import { formatDate } from "@/lib/formatters";
import type {
  InvoiceStatus,
  DebtStatus,
  TicketStatus,
  TicketPriority,
} from "@prisma/client";

export type ExportType =
  | "customers"
  | "suppliers"
  | "invoices"
  | "debts"
  | "expenses"
  | "products"
  | "tickets";

export interface ExportColumn {
  key: string;
  header: string;
}

export type ExportCell = string | number;
export type ExportRow = Record<string, ExportCell>;

export interface ExportTable {
  name: string;
  columns: ExportColumn[];
  rows: ExportRow[];
}

export interface ExportDataset {
  title: string;
  filename: string;
  columns: ExportColumn[];
  rows: ExportRow[];
  /**
   * Optional multi-table export. When present it takes precedence over the
   * top-level columns/rows — each table becomes its own XLSX sheet and a
   * separate section in the PDF.
   */
  tables?: ExportTable[];
}

interface DatasetDef {
  title: string;
  filename: string;
  columns: ExportColumn[];
  fetch: (ownerId: string, sp: URLSearchParams) => Promise<ExportRow[]>;
}

const num = (v: unknown) => Number(v ?? 0);
const round2 = (v: unknown) => Math.round(num(v) * 100) / 100;
const text = (v: string | null | undefined) => v ?? "—";

function dateRange(sp: URLSearchParams) {
  const dateFrom = sp.get("dateFrom");
  const dateTo = sp.get("dateTo");
  if (!dateFrom && !dateTo) return undefined;
  return {
    ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
    ...(dateTo ? { lte: new Date(dateTo + "T23:59:59") } : {}),
  };
}

const DATASETS: Record<ExportType, DatasetDef> = {
  // ── العملاء ──────────────────────────────────────────────────────────────
  customers: {
    title: "تقرير العملاء",
    filename: "customers",
    columns: [
      { key: "name", header: "الاسم" },
      { key: "phone", header: "الهاتف" },
      { key: "address", header: "العنوان" },
      { key: "invoices", header: "عدد الفواتير" },
      { key: "tickets", header: "الصيانة" },
      { key: "debts", header: "الديون" },
      { key: "totalSpent", header: "إجمالي الإنفاق" },
      { key: "createdAt", header: "تاريخ التسجيل" },
    ],
    async fetch(ownerId, sp) {
      const search = sp.get("search") ?? "";
      const where = {
        ownerId,
        isDeleted: false,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" as const } },
                { phone: { contains: search } },
              ],
            }
          : {}),
      };
      const customers = await prisma.customer.findMany({
        where,
        include: {
          _count: {
            select: {
              invoices: { where: { isDeleted: false } },
              maintenanceTickets: { where: { isDeleted: false } },
              debts: { where: { isDeleted: false } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });
      const spent = await prisma.invoice.groupBy({
        by: ["customerId"],
        where: {
          ownerId,
          isDeleted: false,
          status: { in: ["PAID", "PARTIAL", "ISSUED"] },
        },
        _sum: { total: true },
      });
      const spentMap = Object.fromEntries(
        spent.map((s) => [s.customerId, round2(s._sum.total)])
      );
      return customers.map((c) => ({
        name: c.name,
        phone: text(c.phone),
        address: text(c.address),
        invoices: c._count.invoices,
        tickets: c._count.maintenanceTickets,
        debts: c._count.debts,
        totalSpent: spentMap[c.id] ?? 0,
        createdAt: formatDate(c.createdAt),
      }));
    },
  },

  // ── الموردون ─────────────────────────────────────────────────────────────
  suppliers: {
    title: "تقرير الموردين",
    filename: "suppliers",
    columns: [
      { key: "name", header: "الاسم" },
      { key: "company", header: "الشركة" },
      { key: "phone", header: "الهاتف" },
      { key: "products", header: "المنتجات" },
      { key: "payables", header: "المستحقات" },
      { key: "notes", header: "ملاحظات" },
      { key: "createdAt", header: "تاريخ الإضافة" },
    ],
    async fetch(ownerId, sp) {
      const search = sp.get("search") ?? "";
      const where = {
        ownerId,
        isDeleted: false,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" as const } },
                { company: { contains: search, mode: "insensitive" as const } },
                { phone: { contains: search } },
              ],
            }
          : {}),
      };
      const suppliers = await prisma.supplier.findMany({
        where,
        include: {
          _count: {
            select: {
              products: { where: { isDeleted: false } },
              payables: { where: { isDeleted: false } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });
      return suppliers.map((s) => ({
        name: s.name,
        company: text(s.company),
        phone: text(s.phone),
        products: s._count.products,
        payables: s._count.payables,
        notes: text(s.notes),
        createdAt: formatDate(s.createdAt),
      }));
    },
  },

  // ── الفواتير (المعاملات) ───────────────────────────────────────────────────
  invoices: {
    title: "تقرير الفواتير",
    filename: "invoices",
    columns: [
      { key: "invoiceNumber", header: "رقم الفاتورة" },
      { key: "customer", header: "العميل" },
      { key: "date", header: "التاريخ" },
      { key: "status", header: "الحالة" },
      { key: "currency", header: "العملة" },
      { key: "total", header: "الإجمالي" },
      { key: "paid", header: "المدفوع" },
      { key: "remaining", header: "المتبقي" },
    ],
    async fetch(ownerId, sp) {
      const search = sp.get("search") ?? "";
      const status = sp.get("status") as InvoiceStatus | null;
      const customerId = sp.get("customerId") ?? "";
      const where = {
        ownerId,
        isDeleted: false,
        ...(status ? { status } : {}),
        ...(customerId ? { customerId } : {}),
        ...(search
          ? {
              OR: [
                { invoiceNumber: { contains: search, mode: "insensitive" as const } },
                { customer: { name: { contains: search, mode: "insensitive" as const } } },
              ],
            }
          : {}),
        ...(dateRange(sp) ? { createdAt: dateRange(sp) } : {}),
      };
      const invoices = await prisma.invoice.findMany({
        where,
        include: { customer: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      });
      return invoices.map((i) => ({
        invoiceNumber: i.invoiceNumber,
        customer: i.customer.name,
        date: formatDate(i.createdAt),
        status: INVOICE_STATUS_LABELS[i.status],
        currency: i.currency,
        total: round2(i.total),
        paid: round2(i.paidAmount),
        remaining: round2(i.remainingAmount),
      }));
    },
  },

  // ── ديون العملاء ──────────────────────────────────────────────────────────
  debts: {
    title: "تقرير ديون العملاء",
    filename: "debts",
    columns: [
      { key: "customer", header: "العميل" },
      { key: "phone", header: "الهاتف" },
      { key: "reason", header: "السبب / الفاتورة" },
      { key: "currency", header: "العملة" },
      { key: "amount", header: "المبلغ" },
      { key: "paid", header: "المسدد" },
      { key: "remaining", header: "المتبقي" },
      { key: "status", header: "الحالة" },
      { key: "dueDate", header: "الاستحقاق" },
      { key: "createdAt", header: "التاريخ" },
    ],
    async fetch(ownerId, sp) {
      const search = sp.get("search") ?? "";
      const status = sp.get("status") as DebtStatus | null;
      const customerId = sp.get("customerId") ?? "";
      const where = {
        ownerId,
        isDeleted: false,
        NOT: { invoice: { status: "CANCELLED" as const } },
        // Mirror the list view: default to unpaid debts unless a status is chosen.
        ...(status ? { status } : { status: { not: "PAID" as const } }),
        ...(customerId ? { customerId } : {}),
        ...(search
          ? { customer: { name: { contains: search, mode: "insensitive" as const } } }
          : {}),
      };
      const debts = await prisma.debt.findMany({
        where,
        include: {
          customer: { select: { name: true, phone: true } },
          invoice: { select: { invoiceNumber: true } },
          payments: { select: { amount: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      return debts.map((d) => {
        const paid = d.payments.reduce((s, p) => s + num(p.amount), 0);
        return {
          customer: d.customer.name,
          phone: text(d.customer.phone),
          reason: d.invoice ? d.invoice.invoiceNumber : text(d.reason),
          currency: d.currency,
          amount: round2(d.amount),
          paid: round2(paid),
          remaining: round2(num(d.amount) - paid),
          status: DEBT_STATUS_LABELS[d.status],
          dueDate: d.dueDate ? formatDate(d.dueDate) : "—",
          createdAt: formatDate(d.createdAt),
        };
      });
    },
  },

  // ── المصاريف ──────────────────────────────────────────────────────────────
  expenses: {
    title: "تقرير المصاريف",
    filename: "expenses",
    columns: [
      { key: "date", header: "التاريخ" },
      { key: "category", header: "الفئة" },
      { key: "description", header: "الوصف" },
      { key: "currency", header: "العملة" },
      { key: "amount", header: "المبلغ" },
    ],
    async fetch(ownerId, sp) {
      const search = sp.get("search") ?? "";
      const categoryId = sp.get("categoryId") ?? "";
      const where = {
        ownerId,
        isDeleted: false,
        ...(categoryId ? { categoryId } : {}),
        ...(search ? { description: { contains: search, mode: "insensitive" as const } } : {}),
        ...(dateRange(sp) ? { date: dateRange(sp) } : {}),
      };
      const expenses = await prisma.expense.findMany({
        where,
        include: { category: { select: { name: true } } },
        orderBy: { date: "desc" },
      });
      return expenses.map((e) => ({
        date: formatDate(e.date),
        category: text(e.category?.name),
        description: text(e.description),
        currency: e.currency,
        amount: round2(e.amount),
      }));
    },
  },

  // ── المخزون ───────────────────────────────────────────────────────────────
  products: {
    title: "تقرير المخزون",
    filename: "inventory",
    columns: [
      { key: "name", header: "المنتج" },
      { key: "sku", header: "SKU" },
      { key: "barcode", header: "الباركود" },
      { key: "category", header: "الفئة" },
      { key: "stockQty", header: "الكمية" },
      { key: "minStockQty", header: "الحد الأدنى" },
      { key: "costPrice", header: "سعر التكلفة" },
      { key: "sellPrice", header: "سعر البيع" },
    ],
    async fetch(ownerId, sp) {
      const search = sp.get("search") ?? "";
      const categoryId = sp.get("categoryId") ?? "";
      const lowStock = sp.get("lowStock") === "true";
      const products = await prisma.product.findMany({
        where: {
          ownerId,
          isDeleted: false,
          ...(search
            ? {
                OR: [
                  { name: { contains: search, mode: "insensitive" as const } },
                  { sku: { contains: search, mode: "insensitive" as const } },
                  { barcode: { contains: search, mode: "insensitive" as const } },
                ],
              }
            : {}),
          ...(categoryId && categoryId !== "all" ? { categoryId } : {}),
        },
        include: { category: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      });
      const rows = products.map((p) => ({
        name: p.name,
        sku: text(p.sku),
        barcode: text(p.barcode),
        category: text(p.category?.name),
        stockQty: p.stockQty,
        minStockQty: p.minStockQty,
        costPrice: round2(p.costPrice),
        sellPrice: round2(p.sellPrice),
      }));
      return lowStock
        ? rows.filter((r) => (r.stockQty as number) <= (r.minStockQty as number))
        : rows;
    },
  },

  // ── الصيانة ───────────────────────────────────────────────────────────────
  tickets: {
    title: "تقرير الصيانة",
    filename: "maintenance",
    columns: [
      { key: "ticketNumber", header: "رقم التذكرة" },
      { key: "customer", header: "العميل" },
      { key: "device", header: "الجهاز" },
      { key: "problem", header: "المشكلة" },
      { key: "status", header: "الحالة" },
      { key: "priority", header: "الأولوية" },
      { key: "cost", header: "التكلفة" },
      { key: "receivedAt", header: "تاريخ الاستلام" },
    ],
    async fetch(ownerId, sp) {
      const search = sp.get("search") ?? "";
      const status = sp.get("status") as TicketStatus | null;
      const priority = sp.get("priority") as TicketPriority | null;
      const customerId = sp.get("customerId") ?? "";
      const where = {
        ownerId,
        isDeleted: false,
        ...(status ? { status } : {}),
        ...(priority ? { priority } : {}),
        ...(customerId ? { customerId } : {}),
        ...(search
          ? {
              OR: [
                { ticketNumber: { contains: search, mode: "insensitive" as const } },
                { customer: { name: { contains: search, mode: "insensitive" as const } } },
                { deviceBrand: { contains: search, mode: "insensitive" as const } },
                { deviceModel: { contains: search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      };
      const tickets = await prisma.maintenanceTicket.findMany({
        where,
        include: { customer: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      });
      return tickets.map((t) => {
        const device = [DEVICE_TYPE_LABELS[t.deviceType], t.deviceBrand, t.deviceModel]
          .filter(Boolean)
          .join(" ");
        const cost = t.finalCost ?? t.estimatedCost;
        return {
          ticketNumber: t.ticketNumber,
          customer: t.customer.name,
          device: device || "—",
          problem: text(t.problemDescription),
          status: TICKET_STATUS_LABELS[t.status],
          priority: TICKET_PRIORITY_LABELS[t.priority],
          cost: cost == null ? "—" : round2(cost),
          receivedAt: formatDate(t.receivedAt),
        };
      });
    },
  },
};

export function isExportType(v: string): v is ExportType {
  return v in DATASETS;
}

export async function buildExportDataset(
  type: ExportType,
  ownerId: string,
  sp: URLSearchParams
): Promise<ExportDataset> {
  const def = DATASETS[type];
  const rows = await def.fetch(ownerId, sp);
  return { title: def.title, filename: def.filename, columns: def.columns, rows };
}
