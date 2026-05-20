"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PageHeader,
  SearchInput,
  StatusBadge,
  Pagination,
  EmptyState,
  CardSkeleton,
  CurrencyDisplay,
  StatCard,
} from "@/components/shared";
import { INVOICE_STATUS_LABELS, ITEMS_PER_PAGE } from "@/lib/constants";
import { formatDate } from "@/lib/formatters";
import type { InvoiceStatus, Currency } from "@prisma/client";

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  total: string | number;
  paidAmount: string | number;
  remainingAmount: string | number;
  currency: Currency;
  createdAt: string;
  customer: { id: string; name: string; phone: string | null };
  _count: { items: number };
}

const STATUSES: Array<{ value: InvoiceStatus | ""; label: string }> = [
  { value: "", label: "الكل" },
  { value: "DRAFT", label: "مسودة" },
  { value: "ISSUED", label: "مُصدرة" },
  { value: "PARTIAL", label: "جزئية" },
  { value: "PAID", label: "مدفوعة" },
  { value: "CANCELLED", label: "ملغاة" },
];

export default function InvoicesPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<InvoiceStatus | "">("");
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({ total: 0, paid: 0, remaining: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: page.toString(),
      search,
      ...(status ? { status } : {}),
    });
    const res = await fetch(`/api/invoices?${params}`);
    if (res.ok) {
      const data = await res.json();
      setInvoices(data.invoices);
      setTotal(data.total);
      setTotalPages(data.pageCount);
      setSummary(data.summary);
    }
    setLoading(false);
  }, [page, search, status]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, status]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="الفواتير"
        subtitle={`${total} فاتورة`}
        action={
          <Link href="/invoices/new">
            <Button className="gap-2"><Plus className="h-4 w-4" />فاتورة جديدة</Button>
          </Link>
        }
        breadcrumb={[{ label: "الرئيسية", href: "/dashboard" }, { label: "الفواتير" }]}
      />

      {/* Summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="إجمالي الفواتير" value={`₪${summary.total.toFixed(2)}`} icon={FileText} />
        <StatCard label="المدفوع" value={`₪${summary.paid.toFixed(2)}`} icon={FileText} trend={{ value: 0, label: "" }} />
        <StatCard label="المتبقي (ديون)" value={`₪${summary.remaining.toFixed(2)}`} icon={FileText} />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:items-center">
        <SearchInput onSearch={setSearch} placeholder="بحث برقم الفاتورة أو العميل..." className="w-full sm:w-64" />
        <div className="flex gap-1 bg-[#f1f5f9] rounded-lg p-1 overflow-x-auto -mx-1 px-1">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              onClick={() => setStatus(s.value)}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-all whitespace-nowrap flex-shrink-0 ${
                status === s.value ? "bg-white text-[#104e98] shadow-sm" : "text-[#64748b] hover:text-[#1e293b]"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <CardSkeleton />
      ) : invoices.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="لا توجد فواتير"
          description="أنشئ أول فاتورة للبدء"
          action={{ label: "فاتورة جديدة", onClick: () => router.push("/invoices/new") }}
        />
      ) : (
        <>
          {/* Mobile: card list */}
          <ul className="md:hidden space-y-2">
            {invoices.map((inv) => (
              <li key={inv.id} className="bg-white rounded-xl border border-[#e2e8f0] p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <Link href={`/invoices/${inv.id}`} className="font-bold text-[#104e98] hover:underline ltr">
                    {inv.invoiceNumber}
                  </Link>
                  <StatusBadge status={{ type: "invoice", status: inv.status }} />
                </div>
                <Link href={`/customers/${inv.customer.id}`} className="block text-sm font-medium text-[#1e293b] hover:text-[#104e98] mb-1">
                  {inv.customer.name}
                </Link>
                <div className="text-xs text-[#94a3b8] mb-3">{formatDate(inv.createdAt)}</div>
                <dl className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt className="text-[#64748b]">الإجمالي</dt>
                    <dd className="mt-0.5"><CurrencyDisplay amount={Number(inv.total)} currency={inv.currency} size="sm" /></dd>
                  </div>
                  <div>
                    <dt className="text-[#64748b]">المدفوع</dt>
                    <dd className="mt-0.5 text-green-600">
                      {Number(inv.paidAmount) > 0
                        ? <CurrencyDisplay amount={Number(inv.paidAmount)} currency={inv.currency} size="sm" className="text-green-600" />
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#64748b]">المتبقي</dt>
                    <dd className="mt-0.5 text-orange-600">
                      {Number(inv.remainingAmount) > 0
                        ? <CurrencyDisplay amount={Number(inv.remainingAmount)} currency={inv.currency} size="sm" className="text-orange-600" />
                        : "—"}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <div className="hidden md:block bg-white rounded-xl border border-[#e2e8f0] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#f8fafc] border-b border-[#e2e8f0]">
                  <tr>
                    <th className="text-right px-4 py-3 font-medium text-[#64748b]">رقم الفاتورة</th>
                    <th className="text-right px-4 py-3 font-medium text-[#64748b]">العميل</th>
                    <th className="text-right px-4 py-3 font-medium text-[#64748b]">التاريخ</th>
                    <th className="text-right px-4 py-3 font-medium text-[#64748b]">الإجمالي</th>
                    <th className="text-right px-4 py-3 font-medium text-[#64748b]">المدفوع</th>
                    <th className="text-right px-4 py-3 font-medium text-[#64748b]">المتبقي</th>
                    <th className="text-right px-4 py-3 font-medium text-[#64748b]">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f9]">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-[#f8fafc] transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/invoices/${inv.id}`} className="font-medium text-[#104e98] hover:underline ltr">
                          {inv.invoiceNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/customers/${inv.customer.id}`} className="text-[#1e293b] hover:text-[#104e98]">
                          {inv.customer.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-[#64748b]">{formatDate(inv.createdAt)}</td>
                      <td className="px-4 py-3">
                        <CurrencyDisplay amount={Number(inv.total)} currency={inv.currency} />
                      </td>
                      <td className="px-4 py-3 text-green-600">
                        {Number(inv.paidAmount) > 0 && (
                          <CurrencyDisplay amount={Number(inv.paidAmount)} currency={inv.currency} />
                        )}
                      </td>
                      <td className="px-4 py-3 text-orange-600">
                        {Number(inv.remainingAmount) > 0 && (
                          <CurrencyDisplay amount={Number(inv.remainingAmount)} currency={inv.currency} />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={{ type: "invoice", status: inv.status }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} total={total} limit={ITEMS_PER_PAGE} onPageChange={setPage} />
      )}
    </div>
  );
}
