import { notFound, redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { SHOP_INFO, INVOICE_STATUS_LABELS, DEBT_STATUS_LABELS } from "@/lib/constants";
import { formatDate, formatDateTime, formatCurrency } from "@/lib/formatters";
import PrintButton from "./PrintButton";

export default async function CustomerStatementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const ctx = await requireUser();
  if (ctx instanceof NextResponse) redirect("/login");

  const customer = await prisma.customer.findFirst({
    where: { id, ownerId: ctx.ownerId, isDeleted: false },
  });
  if (!customer) notFound();

  const [unpaidInvoices, otherDebts, invoicePayments, debtPayments] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        customerId: id,
        ownerId: ctx.ownerId,
        isDeleted: false,
        remainingAmount: { gt: 0 },
        status: { notIn: ["DRAFT", "CANCELLED"] },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.debt.findMany({
      where: {
        customerId: id,
        ownerId: ctx.ownerId,
        isDeleted: false,
        invoiceId: null,
        status: { not: "PAID" },
      },
      include: { payments: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.invoicePayment.findMany({
      where: { invoice: { customerId: id, ownerId: ctx.ownerId, isDeleted: false } },
      include: { invoice: { select: { invoiceNumber: true } }, createdBy: { select: { name: true } } },
      orderBy: { paidAt: "desc" },
    }),
    prisma.debtPayment.findMany({
      where: { debt: { customerId: id, ownerId: ctx.ownerId, isDeleted: false, invoiceId: null } },
      include: { debt: { select: { reason: true } }, createdBy: { select: { name: true } } },
      orderBy: { paidAt: "desc" },
    }),
  ]);

  // Merge invoice-linked payments and standalone-debt payments into one
  // chronological log. Invoice-linked debt installments are intentionally
  // excluded here — every one of them already has a mirrored InvoicePayment
  // row (see app/api/debts/[id]/payment/route.ts), so pulling DebtPayment
  // for those too would double-count the same money.
  const payments = [
    ...invoicePayments.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      note: p.note,
      paidAt: p.paidAt,
      source: `فاتورة ${p.invoice.invoiceNumber}`,
      by: p.createdBy?.name ?? null,
    })),
    ...debtPayments.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      note: p.note,
      paidAt: p.paidAt,
      source: p.debt.reason ?? "دين",
      by: p.createdBy?.name ?? null,
    })),
  ].sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime());

  const debtsWithBalance = otherDebts.map((d) => {
    const paid = d.payments.reduce((s, p) => s + Number(p.amount), 0);
    return { ...d, paid, remaining: Number(d.amount) - paid };
  });

  // Group outstanding totals by currency in case a customer has debt in
  // more than one (rare, but the schema allows it).
  const totalsByCurrency = new Map<string, number>();
  for (const inv of unpaidInvoices) {
    totalsByCurrency.set(inv.currency, (totalsByCurrency.get(inv.currency) ?? 0) + Number(inv.remainingAmount));
  }
  for (const d of debtsWithBalance) {
    totalsByCurrency.set(d.currency, (totalsByCurrency.get(d.currency) ?? 0) + d.remaining);
  }

  const isEmpty = unpaidInvoices.length === 0 && debtsWithBalance.length === 0 && payments.length === 0;

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { size: A4; margin: 12mm; }
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          thead { display: table-header-group; }
        }
        body { font-family: var(--font-arabic, 'IBM Plex Sans Arabic', sans-serif); }
      `}</style>

      <div className="no-print fixed top-4 left-4 flex gap-2 z-10">
        <PrintButton />
        <a href={`/customers/${id}`} className="px-4 py-2 text-sm border rounded-lg bg-white hover:bg-gray-50">
          العودة
        </a>
      </div>

      <div className="max-w-[210mm] mx-auto p-8 min-h-screen">
        {/* Header */}
        <div className="flex justify-between items-start mb-8 pb-6 border-b-2 border-[#104e98] gap-6">
          <div className="flex items-center gap-4 min-w-0">
            <img src="/logo-blue.png" alt={SHOP_INFO.name} className="h-24 w-24 object-contain flex-shrink-0" />
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-[#0b2345] leading-tight">{SHOP_INFO.name}</h1>
              <p className="text-sm text-[#64748b] mt-1">{SHOP_INFO.address}</p>
              <p className="text-sm text-[#64748b] ltr">{SHOP_INFO.phone}</p>
            </div>
          </div>
          <div className="text-left flex-shrink-0">
            <div className="text-xs uppercase tracking-wider text-[#94a3b8]">كشف حساب</div>
            <div className="text-sm text-[#64748b] mt-1">{formatDate(new Date())}</div>
          </div>
        </div>

        {/* Customer info */}
        <div className="mb-6 bg-[#f8fafc] rounded-xl p-4">
          <h2 className="text-sm font-semibold text-[#64748b] mb-2">بيانات العميل</h2>
          <p className="font-bold text-[#0b2345]">{customer.name}</p>
          {customer.phone && <p className="text-sm text-[#64748b] ltr">{customer.phone}</p>}
          {customer.address && <p className="text-sm text-[#64748b]">{customer.address}</p>}
        </div>

        {isEmpty && (
          <div className="text-center text-sm text-[#94a3b8] py-12">
            لا توجد ديون أو فواتير غير مدفوعة على هذا العميل
          </div>
        )}

        {/* Unpaid invoices */}
        {unpaidInvoices.length > 0 && (
          <>
            <h3 className="text-sm font-bold text-[#0b2345] mb-2 bg-[#e8f0fc] px-3 py-1.5 rounded-md inline-block">
              فواتير غير مدفوعة
            </h3>
            <table className="w-full text-sm mb-6">
              <thead>
                <tr className="bg-[#104e98] text-white">
                  <th className="text-right px-3 py-2.5 rounded-tr-lg">رقم الفاتورة</th>
                  <th className="text-right px-3 py-2.5">التاريخ</th>
                  <th className="text-left px-3 py-2.5">الإجمالي</th>
                  <th className="text-left px-3 py-2.5">المدفوع</th>
                  <th className="text-left px-3 py-2.5">المتبقي</th>
                  <th className="text-right px-3 py-2.5 rounded-tl-lg">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {unpaidInvoices.map((inv, i) => (
                  <tr key={inv.id} className={i % 2 === 0 ? "bg-white" : "bg-[#f8fafc]"}>
                    <td className="px-3 py-2.5 font-medium text-[#1e293b] ltr">{inv.invoiceNumber}</td>
                    <td className="px-3 py-2.5 text-[#64748b]">{formatDate(inv.createdAt)}</td>
                    <td className="px-3 py-2.5 ltr text-left">{formatCurrency(Number(inv.total), inv.currency)}</td>
                    <td className="px-3 py-2.5 ltr text-left text-green-600">{formatCurrency(Number(inv.paidAmount), inv.currency)}</td>
                    <td className="px-3 py-2.5 ltr text-left font-medium text-orange-600">{formatCurrency(Number(inv.remainingAmount), inv.currency)}</td>
                    <td className="px-3 py-2.5">{INVOICE_STATUS_LABELS[inv.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* Other debts (not tied to an invoice) */}
        {debtsWithBalance.length > 0 && (
          <>
            <h3 className="text-sm font-bold text-[#0b2345] mb-2 bg-[#e8f0fc] px-3 py-1.5 rounded-md inline-block">
              ديون أخرى
            </h3>
            <table className="w-full text-sm mb-6">
              <thead>
                <tr className="bg-[#104e98] text-white">
                  <th className="text-right px-3 py-2.5 rounded-tr-lg">السبب</th>
                  <th className="text-right px-3 py-2.5">التاريخ</th>
                  <th className="text-right px-3 py-2.5">الاستحقاق</th>
                  <th className="text-left px-3 py-2.5">المبلغ</th>
                  <th className="text-left px-3 py-2.5">المدفوع</th>
                  <th className="text-left px-3 py-2.5">المتبقي</th>
                  <th className="text-right px-3 py-2.5 rounded-tl-lg">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {debtsWithBalance.map((d, i) => (
                  <tr key={d.id} className={i % 2 === 0 ? "bg-white" : "bg-[#f8fafc]"}>
                    <td className="px-3 py-2.5 font-medium text-[#1e293b]">{d.reason ?? "—"}</td>
                    <td className="px-3 py-2.5 text-[#64748b]">{formatDate(d.createdAt)}</td>
                    <td className="px-3 py-2.5 text-[#64748b]">{d.dueDate ? formatDate(d.dueDate) : "—"}</td>
                    <td className="px-3 py-2.5 ltr text-left">{formatCurrency(Number(d.amount), d.currency)}</td>
                    <td className="px-3 py-2.5 ltr text-left text-green-600">{formatCurrency(d.paid, d.currency)}</td>
                    <td className="px-3 py-2.5 ltr text-left font-medium text-orange-600">{formatCurrency(d.remaining, d.currency)}</td>
                    <td className="px-3 py-2.5">{DEBT_STATUS_LABELS[d.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* Outstanding total */}
        {totalsByCurrency.size > 0 && (
          <div className="mb-6 flex justify-end">
            <dl className="w-full sm:w-64 space-y-1 text-sm bg-[#f8fafc] rounded-xl p-4">
              {[...totalsByCurrency.entries()].map(([currency, total]) => (
                <div key={currency} className="flex justify-between font-bold text-[#0b2345]">
                  <dt>الإجمالي المستحق</dt>
                  <dd className="ltr">{formatCurrency(total, currency as "ILS" | "USD" | "JOD")}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {/* Payment history */}
        {payments.length > 0 && (
          <>
            <h3 className="text-sm font-bold text-[#0b2345] mb-2 bg-[#e8f0fc] px-3 py-1.5 rounded-md inline-block">
              سجل الدفعات
            </h3>
            <ul className="divide-y divide-[#f1f5f9] mb-6">
              {payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <span className="font-medium text-[#1e293b] ltr">{formatCurrency(p.amount)}</span>
                    <span className="text-[#64748b] mr-2">{p.source}</span>
                    {p.note && <span className="text-[#94a3b8] mr-2">{p.note}</span>}
                    {p.by && <span className="text-[#94a3b8] mr-2">— {p.by}</span>}
                  </div>
                  <span className="text-[#94a3b8]">{formatDateTime(p.paidAt)}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        {/* Footer */}
        <div className="border-t border-[#e2e8f0] pt-4 text-center text-xs text-[#94a3b8]">
          <p>شكرًا لتعاملكم مع {SHOP_INFO.nameAr}</p>
          <p className="ltr mt-1">{SHOP_INFO.phone} · {SHOP_INFO.address}</p>
        </div>
      </div>
    </>
  );
}
