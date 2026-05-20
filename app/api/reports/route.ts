import { NextRequest, NextResponse } from "next/server";
import { ok } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const type = searchParams.get("type") ?? "pl";
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    const fromDate = dateFrom ? new Date(dateFrom) : (() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; })();
    const toDate = dateTo ? new Date(dateTo + "T23:59:59") : new Date();

    const dateFilter = { gte: fromDate, lte: toDate };

    if (type === "pl") {
      const [revenue, expenses, debtPayments] = await Promise.all([
        prisma.invoice.aggregate({
          where: { isDeleted: false, status: { in: ["PAID", "PARTIAL", "ISSUED"] }, createdAt: dateFilter },
          _sum: { total: true, paidAmount: true, remainingAmount: true },
          _count: true,
        }),
        prisma.expense.aggregate({
          where: { isDeleted: false, date: dateFilter },
          _sum: { amount: true },
          _count: true,
        }),
        prisma.debtPayment.aggregate({
          where: { paidAt: dateFilter },
          _sum: { amount: true },
        }),
      ]);

      const totalRevenue = Number(revenue._sum.total ?? 0);
      const totalExpenses = Number(expenses._sum.amount ?? 0);
      const netProfit = totalRevenue - totalExpenses;

      return ok({
        type: "pl",
        period: { from: fromDate, to: toDate },
        revenue: {
          total: totalRevenue,
          paid: Number(revenue._sum.paidAmount ?? 0),
          outstanding: Number(revenue._sum.remainingAmount ?? 0),
          invoiceCount: revenue._count,
        },
        expenses: {
          total: totalExpenses,
          count: expenses._count,
        },
        debtCollected: Number(debtPayments._sum.amount ?? 0),
        netProfit,
        profitMargin: totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : "0",
      });
    }

    if (type === "sales") {
      const invoices = await prisma.invoice.findMany({
        where: { isDeleted: false, status: { in: ["PAID", "PARTIAL", "ISSUED"] }, createdAt: dateFilter },
        include: {
          customer: { select: { id: true, name: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      // Group by day
      const byDay: Record<string, { date: string; revenue: number; count: number }> = {};
      invoices.forEach((inv) => {
        const key = inv.createdAt.toISOString().split("T")[0];
        if (!byDay[key]) byDay[key] = { date: key, revenue: 0, count: 0 };
        byDay[key].revenue += Number(inv.total);
        byDay[key].count += 1;
      });

      // Top customers
      const customerMap: Record<string, { name: string; revenue: number; count: number }> = {};
      invoices.forEach((inv) => {
        const { id, name } = inv.customer;
        if (!customerMap[id]) customerMap[id] = { name, revenue: 0, count: 0 };
        customerMap[id].revenue += Number(inv.total);
        customerMap[id].count += 1;
      });

      const topCustomers = Object.entries(customerMap)
        .map(([id, v]) => ({ id, ...v }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

      return ok({
        type: "sales",
        byDay: Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)),
        topCustomers,
        summary: {
          total: invoices.reduce((s, i) => s + Number(i.total), 0),
          count: invoices.length,
        },
      });
    }

    if (type === "inventory") {
      const [lowStock, allProducts] = await Promise.all([
        prisma.$queryRaw<Array<{ id: string; name: string; sku: string | null; stockQty: number; minStockQty: number; sellPrice: number }>>`
          SELECT id, name, sku, "stockQty", "minStockQty", "sellPrice"
          FROM "Product"
          WHERE "isActive" = true AND "isDeleted" = false
          AND "stockQty" <= "minStockQty"
          ORDER BY "stockQty" ASC
        `,
        prisma.product.aggregate({
          where: { isActive: true, isDeleted: false },
          _sum: { stockQty: true },
          _count: true,
        }),
      ]);

      const inventoryValue = await prisma.$queryRaw<[{ value: number }]>`
        SELECT COALESCE(SUM("stockQty"::numeric * "costPrice"), 0) AS value
        FROM "Product"
        WHERE "isActive" = true AND "isDeleted" = false
      `;

      return ok({
        type: "inventory",
        lowStock,
        summary: {
          totalProducts: allProducts._count,
          totalQty: Number(allProducts._sum.stockQty ?? 0),
          inventoryValue: Number(inventoryValue[0]?.value ?? 0),
          lowStockCount: lowStock.length,
        },
      });
    }

    if (type === "debts") {
      const debts = await prisma.debt.findMany({
        where: { isDeleted: false, status: { not: "PAID" } },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          payments: true,
        },
        orderBy: { createdAt: "asc" },
      });

      const now = new Date();
      const aged = debts.map((d) => {
        const paid = d.payments.reduce((s, p) => s + Number(p.amount), 0);
        const remaining = Number(d.amount) - paid;
        const daysSince = Math.floor((now.getTime() - new Date(d.createdAt).getTime()) / 86400000);
        const bucket = daysSince <= 30 ? "0-30" : daysSince <= 60 ? "31-60" : daysSince <= 90 ? "61-90" : "90+";
        return { ...d, paid, remaining, daysSince, bucket };
      });

      const buckets: Record<string, { count: number; total: number }> = {
        "0-30": { count: 0, total: 0 },
        "31-60": { count: 0, total: 0 },
        "61-90": { count: 0, total: 0 },
        "90+": { count: 0, total: 0 },
      };
      aged.forEach((d) => { buckets[d.bucket].count++; buckets[d.bucket].total += d.remaining; });

      return ok({
        type: "debts",
        debts: aged,
        buckets,
        totalOutstanding: aged.reduce((s, d) => s + d.remaining, 0),
      });
    }

    return ok({ error: "نوع تقرير غير صالح" }, { status: 400 });
  } catch (e) {
    console.error(e);
    return ok({ error: "خطأ في الخادم" }, { status: 500 });
  }
}
