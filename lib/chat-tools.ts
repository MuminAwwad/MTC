import { prisma } from "./prisma";

// Per-shop read-only tools the chat assistant can call. Every query is
// scoped by ownerId so a user can never see another shop's data even if the
// LLM hallucinates a customer id.

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  execute: (ownerId: string, args: Record<string, unknown>) => Promise<unknown>;
}

const TOOLS: ToolDefinition[] = [
  {
    name: "get_dashboard_summary",
    description:
      "Today's headline numbers for the shop: today's sales total, count of open repair tickets, count of out-of-stock products, and the total outstanding customer debt.",
    parameters: { type: "object", properties: {}, required: [] },
    execute: async (ownerId) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const [todayRev, openTickets, outOfStock, openDebts] = await Promise.all([
        prisma.invoice.aggregate({
          where: {
            ownerId,
            createdAt: { gte: today, lt: tomorrow },
            status: { in: ["PAID", "PARTIAL", "ISSUED"] },
            isDeleted: false,
          },
          _sum: { total: true },
        }),
        prisma.maintenanceTicket.count({
          where: { ownerId, status: { notIn: ["DELIVERED", "CANCELLED"] }, isDeleted: false },
        }),
        prisma.product.count({
          where: { ownerId, isActive: true, isDeleted: false, stockQty: { lte: 0 } },
        }),
        prisma.debt.findMany({
          where: {
            ownerId,
            status: { in: ["PENDING", "PARTIAL"] },
            isDeleted: false,
            NOT: { invoice: { status: "CANCELLED" } },
          },
          select: { amount: true, payments: { select: { amount: true } } },
        }),
      ]);

      const totalDebt = openDebts.reduce((sum, d) => {
        const paid = d.payments.reduce((s, p) => s + Number(p.amount), 0);
        return sum + Number(d.amount) - paid;
      }, 0);

      return {
        todaySalesILS: Number(todayRev._sum.total ?? 0),
        openTicketCount: openTickets,
        outOfStockProductCount: outOfStock,
        totalOutstandingDebtILS: totalDebt,
      };
    },
  },

  {
    name: "find_customer",
    description:
      "Search the shop's customers by name or phone (partial match, case-insensitive). Returns up to 10 results with their id, name, phone, and a quick stat summary. Use this whenever the user references a customer by name.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Partial name or phone fragment." },
      },
      required: ["query"],
    },
    execute: async (ownerId, args) => {
      const q = String(args.query ?? "").trim();
      if (!q) return { customers: [] };
      const customers = await prisma.customer.findMany({
        where: {
          ownerId,
          isDeleted: false,
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
          ],
        },
        take: 10,
        select: { id: true, name: true, phone: true, address: true },
        orderBy: { name: "asc" },
      });
      return { customers };
    },
  },

  {
    name: "get_customer_debt",
    description:
      "Total outstanding debt (amount minus payments) for a given customer id. Returns an itemized list of unpaid debts with their due dates.",
    parameters: {
      type: "object",
      properties: {
        customerId: { type: "string" },
      },
      required: ["customerId"],
    },
    execute: async (ownerId, args) => {
      const customerId = String(args.customerId);
      const customer = await prisma.customer.findFirst({
        where: { id: customerId, ownerId, isDeleted: false },
        select: { id: true, name: true, phone: true },
      });
      if (!customer) return { error: "customer_not_found" };

      const debts = await prisma.debt.findMany({
        where: {
          ownerId,
          customerId,
          isDeleted: false,
          status: { not: "PAID" },
          NOT: { invoice: { status: "CANCELLED" } },
        },
        include: {
          payments: { select: { amount: true } },
          invoice: { select: { invoiceNumber: true } },
        },
        orderBy: { createdAt: "asc" },
      });

      const items = debts.map((d) => {
        const paid = d.payments.reduce((s, p) => s + Number(p.amount), 0);
        return {
          id: d.id,
          amount: Number(d.amount),
          paid,
          remaining: Number(d.amount) - paid,
          dueDate: d.dueDate?.toISOString().slice(0, 10) ?? null,
          invoiceNumber: d.invoice?.invoiceNumber ?? null,
          reason: d.reason,
        };
      });

      return {
        customer,
        totalRemainingILS: items.reduce((s, d) => s + d.remaining, 0),
        debts: items,
      };
    },
  },

  {
    name: "find_product",
    description:
      "Search products by name, SKU, or barcode. Returns up to 10 matches with stock level, prices, and category.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Partial name / SKU / barcode." },
      },
      required: ["query"],
    },
    execute: async (ownerId, args) => {
      const q = String(args.query ?? "").trim();
      if (!q) return { products: [] };
      const products = await prisma.product.findMany({
        where: {
          ownerId,
          isDeleted: false,
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { sku: { contains: q, mode: "insensitive" } },
            { barcode: { contains: q, mode: "insensitive" } },
          ],
        },
        take: 10,
        select: {
          id: true,
          name: true,
          sku: true,
          stockQty: true,
          minStockQty: true,
          costPrice: true,
          sellPrice: true,
          isActive: true,
          category: { select: { name: true } },
        },
        orderBy: { name: "asc" },
      });
      return {
        products: products.map((p) => ({
          ...p,
          costPrice: Number(p.costPrice),
          sellPrice: Number(p.sellPrice),
          categoryName: p.category?.name ?? null,
        })),
      };
    },
  },

  {
    name: "get_low_stock_products",
    description:
      "Active products whose stock is at or below their minimum stock threshold. Useful when the user asks 'what should I reorder?' or 'what's out of stock?'.",
    parameters: {
      type: "object",
      properties: {
        outOfStockOnly: {
          type: "boolean",
          description:
            "When true, only return products with stockQty <= 0 (truly out of stock). Default false (stockQty <= minStockQty).",
        },
      },
    },
    execute: async (ownerId, args) => {
      const outOfStockOnly = !!args.outOfStockOnly;
      // Cross-column compare can't be done with the Prisma fluent API, so
      // pull every active product and filter in JS. Each shop is small —
      // this stays cheap. Hard cap at 200 results just in case.
      const candidates = await prisma.product.findMany({
        where: { ownerId, isActive: true, isDeleted: false },
        select: {
          id: true,
          name: true,
          sku: true,
          stockQty: true,
          minStockQty: true,
          sellPrice: true,
        },
      });
      const rows = candidates
        .filter((p) =>
          outOfStockOnly ? p.stockQty <= 0 : p.stockQty <= p.minStockQty
        )
        .sort((a, b) => a.stockQty - b.stockQty)
        .slice(0, 50);
      return {
        count: rows.length,
        products: rows.map((r) => ({
          id: r.id,
          name: r.name,
          sku: r.sku,
          stockQty: r.stockQty,
          minStockQty: r.minStockQty,
          sellPrice: Number(r.sellPrice),
        })),
      };
    },
  },

  {
    name: "get_recent_invoices",
    description:
      "Most recent invoices (sales). Defaults to last 10 non-cancelled, non-draft invoices.",
    parameters: {
      type: "object",
      properties: {
        // Numeric params accept either int or string — llama models on Groq
        // sometimes quote integers and Groq's strict validator rejects the
        // call. Server executors coerce via Number(...).
        limit: {
          type: "string",
          description: "Max rows (default 10, max 25).",
        },
      },
    },
    execute: async (ownerId, args) => {
      const limit = Math.min(25, Math.max(1, Number(args.limit ?? 10) || 10));
      const invoices = await prisma.invoice.findMany({
        where: {
          ownerId,
          isDeleted: false,
          status: { notIn: ["DRAFT", "CANCELLED"] },
        },
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          invoiceNumber: true,
          total: true,
          paidAmount: true,
          remainingAmount: true,
          status: true,
          createdAt: true,
          customer: { select: { name: true } },
        },
      });
      return {
        invoices: invoices.map((i) => ({
          invoiceNumber: i.invoiceNumber,
          customerName: i.customer.name,
          total: Number(i.total),
          paid: Number(i.paidAmount),
          remaining: Number(i.remainingAmount),
          status: i.status,
          date: i.createdAt.toISOString().slice(0, 10),
        })),
      };
    },
  },

  {
    name: "get_outstanding_debts",
    description:
      "All unpaid customer debts (status PENDING or PARTIAL). Useful for 'who owes me money?' style questions.",
    parameters: { type: "object", properties: {}, required: [] },
    execute: async (ownerId) => {
      const debts = await prisma.debt.findMany({
        where: {
          ownerId,
          isDeleted: false,
          status: { not: "PAID" },
          NOT: { invoice: { status: "CANCELLED" } },
        },
        include: {
          customer: { select: { name: true, phone: true } },
          payments: { select: { amount: true } },
          invoice: { select: { invoiceNumber: true } },
        },
        orderBy: { dueDate: { sort: "asc", nulls: "last" } },
        take: 50,
      });
      const items = debts.map((d) => {
        const paid = d.payments.reduce((s, p) => s + Number(p.amount), 0);
        return {
          customerName: d.customer.name,
          customerPhone: d.customer.phone,
          invoiceNumber: d.invoice?.invoiceNumber ?? null,
          remaining: Number(d.amount) - paid,
          dueDate: d.dueDate?.toISOString().slice(0, 10) ?? null,
        };
      });
      return {
        count: items.length,
        totalILS: items.reduce((s, d) => s + d.remaining, 0),
        debts: items,
      };
    },
  },

  {
    name: "get_open_tickets",
    description:
      "Maintenance tickets that aren't delivered or cancelled yet. Useful for 'what repairs are still in the shop?'.",
    parameters: { type: "object", properties: {}, required: [] },
    execute: async (ownerId) => {
      const tickets = await prisma.maintenanceTicket.findMany({
        where: {
          ownerId,
          isDeleted: false,
          status: { notIn: ["DELIVERED", "CANCELLED"] },
        },
        orderBy: [{ priority: "desc" }, { receivedAt: "asc" }],
        take: 50,
        select: {
          ticketNumber: true,
          status: true,
          priority: true,
          deviceType: true,
          deviceBrand: true,
          deviceModel: true,
          receivedAt: true,
          estimatedDelivery: true,
          customer: { select: { name: true, phone: true } },
        },
      });
      return {
        count: tickets.length,
        tickets: tickets.map((t) => ({
          ticketNumber: t.ticketNumber,
          customerName: t.customer.name,
          customerPhone: t.customer.phone,
          device: [t.deviceBrand, t.deviceModel].filter(Boolean).join(" ") || t.deviceType,
          status: t.status,
          priority: t.priority,
          receivedDate: t.receivedAt.toISOString().slice(0, 10),
          estimatedDelivery:
            t.estimatedDelivery?.toISOString().slice(0, 10) ?? null,
        })),
      };
    },
  },

  {
    name: "get_top_customers",
    description:
      "Customers with the highest invoice spend in a given window. Default: last 30 days, top 5.",
    parameters: {
      type: "object",
      properties: {
        days: {
          type: "string",
          description: "Lookback window in days. Default 30.",
        },
        limit: {
          type: "string",
          description: "How many customers (1-20). Default 5.",
        },
      },
    },
    execute: async (ownerId, args) => {
      const days = Math.max(1, Math.min(365, Number(args.days ?? 30) || 30));
      const limit = Math.max(1, Math.min(20, Number(args.limit ?? 5) || 5));
      const from = new Date();
      from.setDate(from.getDate() - days);

      const grouped = await prisma.invoice.groupBy({
        by: ["customerId"],
        where: {
          ownerId,
          isDeleted: false,
          status: { in: ["PAID", "PARTIAL", "ISSUED"] },
          createdAt: { gte: from },
        },
        _sum: { total: true },
        _count: true,
        orderBy: { _sum: { total: "desc" } },
        take: limit,
      });
      const customerIds = grouped.map((g) => g.customerId);
      const customers = await prisma.customer.findMany({
        where: { ownerId, id: { in: customerIds } },
        select: { id: true, name: true, phone: true },
      });
      const nameMap = new Map(customers.map((c) => [c.id, c]));
      return {
        windowDays: days,
        customers: grouped.map((g) => ({
          customerName: nameMap.get(g.customerId)?.name ?? "غير معروف",
          phone: nameMap.get(g.customerId)?.phone ?? null,
          totalSpent: Number(g._sum.total ?? 0),
          invoiceCount: g._count,
        })),
      };
    },
  },

  {
    name: "get_sales_period",
    description:
      "Aggregate revenue, invoice count, and average ticket size between two dates (inclusive). Date format: YYYY-MM-DD. If no dates are given the assistant should fall back to the last 7 days.",
    parameters: {
      type: "object",
      properties: {
        from: { type: "string", description: "Start date (YYYY-MM-DD)." },
        to: { type: "string", description: "End date (YYYY-MM-DD)." },
      },
      required: ["from", "to"],
    },
    execute: async (ownerId, args) => {
      const from = new Date(String(args.from));
      const to = new Date(String(args.to) + "T23:59:59");
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        return { error: "invalid_date" };
      }
      const agg = await prisma.invoice.aggregate({
        where: {
          ownerId,
          isDeleted: false,
          status: { in: ["PAID", "PARTIAL", "ISSUED"] },
          createdAt: { gte: from, lte: to },
        },
        _sum: { total: true, paidAmount: true, remainingAmount: true },
        _count: true,
      });
      const total = Number(agg._sum.total ?? 0);
      return {
        from: args.from,
        to: args.to,
        revenueILS: total,
        paidILS: Number(agg._sum.paidAmount ?? 0),
        outstandingILS: Number(agg._sum.remainingAmount ?? 0),
        invoiceCount: agg._count,
        averageInvoiceILS: agg._count > 0 ? total / agg._count : 0,
      };
    },
  },
];

const TOOL_INDEX = new Map(TOOLS.map((t) => [t.name, t]));

export function getToolSchemas() {
  return TOOLS.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

export async function executeTool(
  name: string,
  ownerId: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const tool = TOOL_INDEX.get(name);
  if (!tool) return { error: `unknown_tool:${name}` };
  try {
    return await tool.execute(ownerId, args);
  } catch (e) {
    console.error(`tool ${name} failed:`, e);
    return { error: "tool_execution_failed" };
  }
}
