import { NextResponse } from "next/server";
import { StatCard } from "@/components/shared";
import { TrendingUp, Wrench, Package, CreditCard, Boxes, Banknote } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import prisma from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

async function getStats(ownerId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [todayInvoices, openTickets, lowStockCount, openDebts, stockValue] = await Promise.all([
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
      where: {
        ownerId,
        status: { notIn: ["DELIVERED", "CANCELLED"] },
        isDeleted: false,
      },
    }),
    prisma.product.count({
      where: { ownerId, isActive: true, isDeleted: false, stockQty: { lte: 0 } },
    }),
    prisma.debt.findMany({
      where: {
        ownerId,
        status: { in: ["PENDING", "PARTIAL"] },
        isDeleted: false,
        NOT: { invoice: { status: "CANCELLED" as const } },
      },
      select: { amount: true, payments: { select: { amount: true } } },
    }),
    // Inventory value = what's on the shelves, weighted by quantity: at
    // cost (money tied up in stock) and at sell price (potential revenue).
    // Same definition as the inventory report's inventoryValue.
    prisma.$queryRaw<[{ cost: number; sell: number }]>`
      SELECT
        COALESCE(SUM("stockQty"::numeric * "costPrice"), 0) AS cost,
        COALESCE(SUM("stockQty"::numeric * "sellPrice"), 0) AS sell
      FROM "Product"
      WHERE "isActive" = true AND "isDeleted" = false
      AND "ownerId" = ${ownerId}
    `,
  ]);

  const totalDebt = openDebts.reduce((sum, d) => {
    const paid = d.payments.reduce((s, p) => s + Number(p.amount), 0);
    return sum + Number(d.amount) - paid;
  }, 0);

  return {
    todayRevenue: Number(todayInvoices._sum.total ?? 0),
    openTickets,
    lowStockCount,
    totalDebt,
    stockCostValue: Number(stockValue[0]?.cost ?? 0),
    stockSellValue: Number(stockValue[0]?.sell ?? 0),
  };
}

export async function DashboardStats() {
  let stats = {
    todayRevenue: 0,
    openTickets: 0,
    lowStockCount: 0,
    totalDebt: 0,
    stockCostValue: 0,
    stockSellValue: 0,
  };
  let isAdmin = false;

  try {
    const ctx = await requireUser();
    if (!(ctx instanceof NextResponse)) {
      stats = await getStats(ctx.ownerId);
      isAdmin = ctx.dbUser.role === "ADMIN";
    }
  } catch {
    // DB might not be connected yet — show zeros
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        icon={TrendingUp}
        label="مبيعات اليوم"
        value={formatCurrency(stats.todayRevenue)}
        iconColor="text-[#104e98]"
        iconBg="bg-[#e8f0fc]"
      />
      <StatCard
        icon={Wrench}
        label="تذاكر مفتوحة"
        value={stats.openTickets}
        iconColor="text-orange-600"
        iconBg="bg-orange-100"
      />
      <StatCard
        icon={Package}
        label="منتجات ناقصة"
        value={stats.lowStockCount}
        iconColor={stats.lowStockCount > 0 ? "text-red-600" : "text-green-600"}
        iconBg={stats.lowStockCount > 0 ? "bg-red-100" : "bg-green-100"}
      />
      <StatCard
        icon={CreditCard}
        label="ديون مستحقة"
        value={formatCurrency(stats.totalDebt)}
        iconColor="text-yellow-600"
        iconBg="bg-yellow-100"
      />
      {isAdmin && (
        <StatCard
          icon={Boxes}
          label="تكلفة البضاعة في المخزون"
          value={formatCurrency(stats.stockCostValue)}
          iconColor="text-purple-600"
          iconBg="bg-purple-100"
        />
      )}
      {isAdmin && (
        <StatCard
          icon={Banknote}
          label="قيمة بيع البضاعة في المخزون"
          value={formatCurrency(stats.stockSellValue)}
          iconColor="text-green-600"
          iconBg="bg-green-100"
        />
      )}
    </div>
  );
}
