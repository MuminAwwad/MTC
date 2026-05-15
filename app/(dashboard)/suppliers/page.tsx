"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Plus, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PageHeader,
  SearchInput,
  EmptyState,
  Pagination,
  SectionCard,
} from "@/components/shared";
import { formatDate } from "@/lib/formatters";

interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  company: string | null;
  notes: string | null;
  createdAt: string;
  _count: { products: number; payables: number };
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 20, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ search, page: String(page) });
    const res = await fetch(`/api/suppliers?${params}`);
    const data = await res.json();
    setSuppliers(data.data ?? []);
    setMeta({ total: data.total, page: data.page, limit: data.limit, totalPages: data.totalPages });
    setLoading(false);
  }, [search, page]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <PageHeader
        title="الموردون"
        subtitle={`${meta.total} مورد`}
        breadcrumb={[{ label: "الرئيسية", href: "/dashboard" }, { label: "الموردون" }]}
        action={
          <Button asChild>
            <Link href="/suppliers/new">
              <Plus className="h-4 w-4" />
              مورد جديد
            </Link>
          </Button>
        }
      />

      <SectionCard noPadding>
        <div className="p-4 border-b border-[#f1f5f9]">
          <SearchInput
            onSearch={(v) => { setSearch(v); setPage(1); }}
            placeholder="بحث بالاسم أو الشركة..."
          />
        </div>

        {loading ? (
          <div className="space-y-2 p-4">
            {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-[#f8fafc] rounded animate-pulse" />)}
          </div>
        ) : suppliers.length === 0 ? (
          <EmptyState icon={Truck} title="لا يوجد موردون" description="ابدأ بإضافة أول مورد" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#e2e8f0]">
                    {["المورد", "الشركة", "الهاتف", "المنتجات", "المستحقات", "التاريخ", ""].map((h) => (
                      <th key={h} className="text-right px-4 py-3 text-xs font-semibold text-[#64748b]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((s) => (
                    <tr key={s.id} className="border-b border-[#f8fafc] hover:bg-[#fafbfc]">
                      <td className="px-4 py-3">
                        <Link href={`/suppliers/${s.id}`} className="font-medium text-[#1e293b] hover:text-[#104e98]">
                          {s.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-[#64748b]">{s.company ?? "—"}</td>
                      <td className="px-4 py-3 text-[#64748b] ltr">{s.phone ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className="bg-[#e8f0fc] text-[#104e98] text-xs px-2 py-0.5 rounded-full">
                          {s._count.products}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${s._count.payables > 0 ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-600"}`}>
                          {s._count.payables}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#94a3b8] text-xs">{formatDate(s.createdAt)}</td>
                      <td className="px-4 py-3">
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/suppliers/${s.id}`}>عرض</Link>
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
