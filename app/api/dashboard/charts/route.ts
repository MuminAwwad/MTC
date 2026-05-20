import { ok } from "@/lib/api-response";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const invoices = await prisma.invoice.findMany({
      where: {
        createdAt: { gte: sevenDaysAgo },
        status: { in: ["PAID", "PARTIAL", "ISSUED"] },
        isDeleted: false,
      },
      select: { createdAt: true, total: true },
    });

    // Group by day
    const salesByDay: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      salesByDay[key] = 0;
    }

    invoices.forEach((inv) => {
      const key = inv.createdAt.toISOString().split("T")[0];
      if (key in salesByDay) {
        salesByDay[key] += Number(inv.total);
      }
    });

    const sales = Object.entries(salesByDay).map(([date, total]) => ({
      date: new Date(date).toLocaleDateString("ar", { weekday: "short", day: "numeric" }),
      total,
    }));

    // Category breakdown from invoice items
    const items = await prisma.invoiceItem.findMany({
      where: {
        invoice: {
          createdAt: { gte: sevenDaysAgo },
          status: { in: ["PAID", "PARTIAL", "ISSUED"] },
          isDeleted: false,
        },
      },
      include: {
        product: { include: { category: true } },
      },
    });

    const categoryTotals: Record<string, number> = {};
    let grandTotal = 0;
    items.forEach((item) => {
      const catName = item.product?.category?.name ?? "أخرى";
      categoryTotals[catName] = (categoryTotals[catName] ?? 0) + Number(item.total);
      grandTotal += Number(item.total);
    });

    const categories = Object.entries(categoryTotals).map(([name, value]) => ({
      name,
      value: grandTotal > 0 ? Math.round((value / grandTotal) * 100) : 0,
    }));

    return ok({ sales, categories });
  } catch {
    return ok({ sales: [], categories: [] });
  }
}
