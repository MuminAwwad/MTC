"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { TrendingUp, TrendingDown, Settings } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PageHeader,
  SearchInput,
  SectionCard,
  Pagination,
} from "@/components/shared";
import { formatDateTime } from "@/lib/formatters";
import { STOCK_MOVEMENT_LABELS } from "@/lib/constants";
import type { StockMovementType } from "@prisma/client";

interface Movement {
  id: string;
  type: StockMovementType;
  qty: number;
  note: string | null;
  reference: string | null;
  createdAt: string;
  product: { id: string; name: string; sku: string | null };
  createdBy: { name: string } | null;
}

export default function MovementsPage() {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 20, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      search, page: String(page),
      ...(typeFilter !== "all" ? { type: typeFilter } : {}),
    });
    const res = await fetch(`/api/inventory/movements?${params}`);
    const data = await res.json();
    setMovements(data.data ?? []);
    setMeta({ total: data.total, page: data.page, limit: data.limit, totalPages: data.totalPages });
    setLoading(false);
  }, [search, page, typeFilter]);

  useEffect(() => { load(); }, [load]);

  const ICONS: Record<StockMovementType, React.ReactNode> = {
    IN: <TrendingUp className="h-4 w-4 text-green-600" />,
    OUT: <TrendingDown className="h-4 w-4 text-red-600" />,
    ADJUSTMENT: <Settings className="h-4 w-4 text-blue-600" />,
  };
  const COLORS: Record<StockMovementType, string> = {
    IN: "text-green-600",
    OUT: "text-red-600",
    ADJUSTMENT: "text-blue-600",
  };

  return (
    <div>
      <PageHeader
        title="سجل حركات المخزون"
        subtitle={`${meta.total} حركة`}
        breadcrumb={[
          { label: "الرئيسية", href: "/dashboard" },
          { label: "المخزون", href: "/inventory" },
          { label: "سجل الحركات" },
        ]}
      />

      <SectionCard noPadding>
        <div className="flex flex-wrap gap-3 p-4 border-b border-[#f1f5f9]">
          <SearchInput
            onSearch={(v) => { setSearch(v); setPage(1); }}
            placeholder="بحث بالمنتج..."
            className="flex-1 min-w-48"
          />
          <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="كل الأنواع" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأنواع</SelectItem>
              <SelectItem value="IN">إضافة</SelectItem>
              <SelectItem value="OUT">صرف</SelectItem>
              <SelectItem value="ADJUSTMENT">تعديل</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="space-y-2 p-4">
            {[...Array(8)].map((_, i) => <div key={i} className="h-12 bg-[#f8fafc] rounded animate-pulse" />)}
          </div>
        ) : (
          <>
            {/* Mobile: cards */}
            <ul className="md:hidden divide-y divide-[#f1f5f9]">
              {movements.length === 0 ? (
                <li className="px-4 py-8 text-center text-[#64748b]">لا توجد حركات</li>
              ) : (
                movements.map((m) => (
                  <li key={m.id} className="p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {ICONS[m.type]}
                        <span className={`text-xs font-medium ${COLORS[m.type]}`}>
                          {STOCK_MOVEMENT_LABELS[m.type]}
                        </span>
                      </div>
                      <span className={`font-bold ${COLORS[m.type]}`}>{m.qty}</span>
                    </div>
                    <Link href={`/inventory/${m.product.id}`} className="block text-sm font-medium text-[#1e293b] hover:text-[#104e98] mb-1">
                      {m.product.name}
                      {m.product.sku && <span className="text-xs text-[#94a3b8] mr-1 ltr">({m.product.sku})</span>}
                    </Link>
                    {m.note && <p className="text-xs text-[#64748b] mb-1">{m.note}</p>}
                    <div className="flex items-center justify-between text-xs text-[#94a3b8]">
                      <span>{m.createdBy?.name ?? "—"}</span>
                      <span className="ltr">{formatDateTime(m.createdAt)}</span>
                    </div>
                  </li>
                ))
              )}
            </ul>

            {/* Desktop: table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#e2e8f0]">
                    {["النوع", "المنتج", "الكمية", "ملاحظة", "المستخدم", "التاريخ"].map((h) => (
                      <th key={h} className="text-right px-4 py-3 text-xs font-semibold text-[#64748b]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {movements.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-8 text-[#64748b]">لا توجد حركات</td></tr>
                  ) : (
                    movements.map((m) => (
                      <tr key={m.id} className="border-b border-[#f8fafc] hover:bg-[#fafbfc]">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {ICONS[m.type]}
                            <span className={`text-xs font-medium ${COLORS[m.type]}`}>
                              {STOCK_MOVEMENT_LABELS[m.type]}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/inventory/${m.product.id}`} className="hover:text-[#104e98]">
                            <p className="font-medium text-[#1e293b]">{m.product.name}</p>
                            {m.product.sku && <p className="text-xs text-[#94a3b8] ltr">{m.product.sku}</p>}
                          </Link>
                        </td>
                        <td className={`px-4 py-3 font-bold ${COLORS[m.type]}`}>{m.qty}</td>
                        <td className="px-4 py-3 text-[#64748b]">{m.note ?? "—"}</td>
                        <td className="px-4 py-3 text-[#64748b]">{m.createdBy?.name ?? "—"}</td>
                        <td className="px-4 py-3 text-[#94a3b8] text-xs ltr">{formatDateTime(m.createdAt)}</td>
                      </tr>
                    ))
                  )}
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
