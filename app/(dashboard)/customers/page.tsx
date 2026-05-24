"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Plus, Users, Phone, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PageHeader,
  SearchInput,
  CurrencyDisplay,
  EmptyState,
  Pagination,
  SectionCard,
  ExportMenu,
} from "@/components/shared";
import { formatDate } from "@/lib/formatters";

interface CustomerRow {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  createdAt: string;
  totalSpent: number;
  _count: { invoices: number; maintenanceTickets: number; debts: number };
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 20, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ search, page: String(page) });
    try {
      const res = await fetch(`/api/customers?${params}`);
      const data = await res.json();
      setCustomers(data.data ?? []);
      setMeta({ total: data.total, page: data.page, limit: data.limit, totalPages: data.totalPages });
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <PageHeader
        title="العملاء"
        subtitle={`${meta.total} عميل`}
        breadcrumb={[{ label: "الرئيسية", href: "/dashboard" }, { label: "العملاء" }]}
        action={
          <div className="flex gap-2 flex-wrap">
            <ExportMenu type="customers" params={{ search }} />
            <Button asChild>
              <Link href="/customers/new">
                <Plus className="h-4 w-4" />
                عميل جديد
              </Link>
            </Button>
          </div>
        }
      />

      <SectionCard noPadding>
        <div className="p-4 border-b border-[#f1f5f9]">
          <SearchInput
            onSearch={(v) => { setSearch(v); setPage(1); }}
            placeholder="بحث بالاسم أو رقم الهاتف..."
          />
        </div>

        {loading ? (
          <div className="space-y-2 p-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-16 bg-[#f8fafc] rounded animate-pulse" />
            ))}
          </div>
        ) : customers.length === 0 ? (
          <EmptyState
            icon={Users}
            title="لا يوجد عملاء"
            description={search ? "لم يتم العثور على نتائج" : "ابدأ بإضافة أول عميل"}
          />
        ) : (
          <>
            {/* Mobile: cards */}
            <ul className="md:hidden divide-y divide-[#f1f5f9]">
              {customers.map((c) => (
                <li key={c.id} className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <Link href={`/customers/${c.id}`} className="font-semibold text-[#1e293b] hover:text-[#104e98] min-w-0">
                      <p className="break-words">{c.name}</p>
                      {c.address && <p className="text-xs text-[#94a3b8] mt-0.5 line-clamp-1">{c.address}</p>}
                    </Link>
                    <CurrencyDisplay
                      amount={c.totalSpent}
                      size="sm"
                      className={c.totalSpent > 0 ? "text-green-700 font-semibold flex-shrink-0" : "text-[#94a3b8] flex-shrink-0"}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-2">
                    {c.phone ? (
                      <a href={`tel:${c.phone}`} className="flex items-center gap-1.5 text-xs text-[#64748b] ltr">
                        <Phone className="h-3.5 w-3.5" />
                        {c.phone}
                      </a>
                    ) : (
                      <span className="text-xs text-[#94a3b8]">—</span>
                    )}
                    <div className="flex gap-1.5">
                      <span className="bg-[#e8f0fc] text-[#104e98] text-xs px-2 py-0.5 rounded-full font-medium">
                        {c._count.invoices} فاتورة
                      </span>
                      <span className="bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full font-medium">
                        {c._count.maintenanceTickets} صيانة
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {/* Desktop: table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#e2e8f0]">
                    {["العميل", "الهاتف", "الفواتير", "الصيانة", "إجمالي الإنفاق", "تاريخ التسجيل", ""].map((h) => (
                      <th key={h} className="text-right px-4 py-3 text-xs font-semibold text-[#64748b] whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => (
                    <tr key={c.id} className="border-b border-[#f8fafc] hover:bg-[#fafbfc] transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/customers/${c.id}`} className="hover:text-[#104e98]">
                          <p className="font-medium text-[#1e293b]">{c.name}</p>
                          {c.address && (
                            <p className="text-xs text-[#94a3b8] mt-0.5 line-clamp-1">{c.address}</p>
                          )}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {c.phone ? (
                          <a href={`tel:${c.phone}`} className="flex items-center gap-1.5 text-[#64748b] hover:text-[#104e98] ltr">
                            <Phone className="h-3.5 w-3.5" />
                            {c.phone}
                          </a>
                        ) : (
                          <span className="text-[#94a3b8]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="bg-[#e8f0fc] text-[#104e98] text-xs px-2 py-0.5 rounded-full font-medium">
                          {c._count.invoices}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full font-medium">
                          {c._count.maintenanceTickets}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <CurrencyDisplay
                          amount={c.totalSpent}
                          size="sm"
                          className={c.totalSpent > 0 ? "text-green-700 font-semibold" : "text-[#94a3b8]"}
                        />
                      </td>
                      <td className="px-4 py-3 text-xs text-[#94a3b8]">
                        {formatDate(c.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/customers/${c.id}`}>عرض</Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={meta.page}
              totalPages={meta.totalPages}
              total={meta.total}
              limit={meta.limit}
              onPageChange={setPage}
            />
          </>
        )}
      </SectionCard>
    </div>
  );
}
