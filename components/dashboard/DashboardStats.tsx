import { StatCard } from "@/components/shared";
import { TrendingUp, Wrench, Package, CreditCard } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import prisma from "@/lib/prisma";

async function getStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [todayInvoices, openTickets, lowStockCount, openDebts] = await Promise.all([
    prisma.invoice.aggregate({
      where: {
        createdAt: { gte: today, lt: tomorrow },
        status: { in: ["PAID", "PARTIAL", "ISSUED"] },
        isDeleted: false,
      },
      _sum: { total: true },
    }),
    prisma.maintenanceTicket.count({
      where: {
        status: { notIn: ["DELIVERED", "CANCELLED"] },
        isDeleted: false,
      },
    }),
    prisma.product.count({
      where: { isActive: true, isDeleted: false, stockQty: { lte: 0 } },
    }),
    // Outstanding = sum(amount) − sum(payments) so PARTIAL debts
    // only count for what's still owed.
    prisma.debt.findMany({
      where: {
        status: { in: ["PENDING", "PARTIAL"] },
        isDeleted: false,
        NOT: { invoice: { status: "CANCELLED" as const } },
      },
      select: { amount: true, payments: { select: { amount: true } } },
    }),
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
  };
}

export async function DashboardStats() {
  let stats = { todayRevenue: 0, openTickets: 0, lowStockCount: 0, totalDebt: 0 };

  try {
    stats = await getStats();
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
    </div>
  );
}
