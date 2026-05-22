import { NextResponse } from "next/server";
import Link from "next/link";
import { SectionCard, StatusBadge, CurrencyDisplay } from "@/components/shared";
import { formatDate } from "@/lib/formatters";
import prisma from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import type { InvoiceStatus } from "@prisma/client";

async function getRecentInvoices(ownerId: string) {
  return prisma.invoice.findMany({
    where: { ownerId, isDeleted: false },
    include: { customer: true },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
}

export async function RecentInvoices() {
  let invoices: Awaited<ReturnType<typeof getRecentInvoices>> = [];

  try {
    const ctx = await requireUser();
    if (!(ctx instanceof NextResponse)) {
      invoices = await getRecentInvoices(ctx.dbUser.id);
    }
  } catch {
    // DB not connected
  }

  return (
    <SectionCard
      title="آخر الفواتير"
      action={
        <Button variant="ghost" size="sm" asChild>
          <Link href="/invoices" className="flex items-center gap-1 text-[#104e98]">
            عرض الكل <ArrowLeft className="h-3.5 w-3.5" />
          </Link>
        </Button>
      }
      noPadding
    >
      {invoices.length === 0 ? (
        <p className="text-sm text-[#64748b] text-center py-8">لا توجد فواتير بعد</p>
      ) : (
        <div className="divide-y divide-[#f8fafc]">
          {invoices.map((invoice) => (
            <Link
              key={invoice.id}
              href={`/invoices/${invoice.id}`}
              className="flex items-center justify-between px-5 py-3 hover:bg-[#fafbfc] transition-colors"
            >
              <div>
                <p className="text-sm font-medium text-[#1e293b]">
                  {invoice.customer.name}
                </p>
                <p className="text-xs text-[#94a3b8] mt-0.5">
                  {invoice.invoiceNumber} · {formatDate(invoice.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge
                  status={{ type: "invoice", status: invoice.status as InvoiceStatus }}
                />
                <CurrencyDisplay
                  amount={Number(invoice.total)}
                  currency={invoice.currency}
                  size="sm"
                />
              </div>
            </Link>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
