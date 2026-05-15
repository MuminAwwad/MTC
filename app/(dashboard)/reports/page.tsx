"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { TrendingUp, TrendingDown, Package, CreditCard, ShoppingCart, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, SectionCard, StatCard, LoadingSkeleton } from "@/components/shared";
import { formatDate } from "@/lib/formatters";

type ReportType = "pl" | "sales" | "inventory" | "debts";

const REPORT_TABS: Array<{ type: ReportType; label: string; icon: React.ElementType }> = [
  { type: "pl", label: "الأرباح والخسائر", icon: TrendingUp },
  { type: "sales", label: "تقرير المبيعات", icon: ShoppingCart },
  { type: "inventory", label: "تقرير المخزون", icon: Package },
  { type: "debts", label: "تقادم الديون", icon: CreditCard },
];

function thisMonthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const to = now.toISOString().split("T")[0];
  return { from, to };
}

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<ReportType>("pl");
  const { from: defaultFrom, to: defaultTo } = thisMonthRange();
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(defaultTo);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setData(null);
    const params = new URLSearchParams({ type: activeTab, dateFrom, dateTo });
    const res = await fetch(`/api/reports?${params}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [activeTab, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="التقارير"
        breadcrumb={[{ label: "الرئيسية", href: "/dashboard" }, { label: "التقارير" }]}
      />

      {/* Tabs */}
      <div className="flex gap-1 bg-[#f1f5f9] rounded-xl p-1 flex-wrap">
        {REPORT_TABS.map(({ type, label, icon: Icon }) => (
          <button
            key={type}
            onClick={() => setActiveTab(type)}
            className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg font-medium transition-all flex-1 justify-center ${
              activeTab === type ? "bg-white text-[#104e98] shadow-sm" : "text-[#64748b] hover:text-[#1e293b]"
            }`}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Date range (not for inventory/debts) */}
      {["pl", "sales"].includes(activeTab) && (
        <div className="flex items-center gap-3 flex-wrap">
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" dir="ltr" />
          <span className="text-[#94a3b8]">إلى</span>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" dir="ltr" />
          <Button onClick={load} variant="outline">تحديث</Button>
        </div>
      )}

      {loading && <LoadingSkeleton />}

      {/* P&L Report */}
      {!loading && data && activeTab === "pl" && (() => {
        const d = data as {
          revenue: { total: number; paid: number; outstanding: number; invoiceCount: number };
          expenses: { total: number; count: number };
          debtCollected: number;
          netProfit: number;
          profitMargin: string;
        };
        return (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard label="إجمالي الإيرادات" value={`₪${d.revenue.total.toFixed(2)}`} icon={TrendingUp} iconColor="text-green-600" iconBg="bg-green-50" />
              <StatCard label="إجمالي المصاريف" value={`₪${d.expenses.total.toFixed(2)}`} icon={TrendingDown} iconColor="text-red-500" iconBg="bg-red-50" />
              <StatCard label="صافي الربح" value={`₪${d.netProfit.toFixed(2)}`} icon={TrendingUp} iconColor={d.netProfit >= 0 ? "text-green-600" : "text-red-500"} iconBg={d.netProfit >= 0 ? "bg-green-50" : "bg-red-50"} />
              <StatCard label="هامش الربح" value={`${d.profitMargin}%`} icon={TrendingUp} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <SectionCard title="تفاصيل الإيرادات">
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between"><dt className="text-[#64748b]">إجمالي الفواتير</dt><dd className="font-medium">{d.revenue.invoiceCount} فاتورة</dd></div>
                  <div className="flex justify-between"><dt className="text-[#64748b]">المحصل</dt><dd className="text-green-600 font-medium ltr">₪{d.revenue.paid.toFixed(2)}</dd></div>
                  <div className="flex justify-between"><dt className="text-[#64748b]">الديون المعلقة</dt><dd className="text-orange-500 font-medium ltr">₪{d.revenue.outstanding.toFixed(2)}</dd></div>
                  <div className="flex justify-between"><dt className="text-[#64748b]">دفعات الديون المحصلة</dt><dd className="font-medium ltr">₪{d.debtCollected.toFixed(2)}</dd></div>
                </dl>
              </SectionCard>
              <SectionCard title="تفاصيل المصاريف">
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between"><dt className="text-[#64748b]">عدد المصاريف</dt><dd className="font-medium">{d.expenses.count}</dd></div>
                  <div className="flex justify-between border-t border-[#f1f5f9] pt-2 mt-2"><dt className="font-semibold text-[#0b2345]">الإجمالي</dt><dd className="font-bold text-red-500 ltr">₪{d.expenses.total.toFixed(2)}</dd></div>
                </dl>
              </SectionCard>
            </div>
          </div>
        );
      })()}

      {/* Sales Report */}
      {!loading && data && activeTab === "sales" && (() => {
        const d = data as {
          byDay: Array<{ date: string; revenue: number; count: number }>;
          topCustomers: Array<{ id: string; name: string; revenue: number; count: number }>;
          summary: { total: number; count: number };
        };
        return (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <StatCard label="إجمالي المبيعات" value={`₪${d.summary.total.toFixed(2)}`} icon={TrendingUp} />
              <StatCard label="عدد الفواتير" value={d.summary.count} icon={ShoppingCart} />
            </div>
            <SectionCard title="المبيعات اليومية">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={d.byDay} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} orientation="right" tickFormatter={(v) => `₪${v}`} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} formatter={(v) => [`₪${v}`, "المبيعات"]} />
                  <Bar dataKey="revenue" fill="#104e98" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </SectionCard>
            <SectionCard title="أفضل العملاء">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-right border-b border-[#f1f5f9]">
                    <th className="pb-2 font-medium text-[#64748b]">#</th>
                    <th className="pb-2 font-medium text-[#64748b]">العميل</th>
                    <th className="pb-2 font-medium text-[#64748b]">الفواتير</th>
                    <th className="pb-2 font-medium text-[#64748b]">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f8fafc]">
                  {d.topCustomers.map((c, i) => (
                    <tr key={c.id}>
                      <td className="py-2 text-[#94a3b8]">{i + 1}</td>
                      <td className="py-2">
                        <Link href={`/customers/${c.id}`} className="text-[#104e98] hover:underline">{c.name}</Link>
                      </td>
                      <td className="py-2 text-[#64748b]">{c.count}</td>
                      <td className="py-2 font-medium ltr">₪{c.revenue.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </SectionCard>
          </div>
        );
      })()}

      {/* Inventory Report */}
      {!loading && data && activeTab === "inventory" && (() => {
        const d = data as {
          lowStock: Array<{ id: string; name: string; sku: string | null; stockQty: number; minStockQty: number; sellPrice: number }>;
          summary: { totalProducts: number; totalQty: number; inventoryValue: number; lowStockCount: number };
        };
        return (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard label="إجمالي المنتجات" value={d.summary.totalProducts} icon={Package} />
              <StatCard label="إجمالي الكميات" value={d.summary.totalQty} icon={Package} />
              <StatCard label="قيمة المخزون (تكلفة)" value={`₪${d.summary.inventoryValue.toFixed(2)}`} icon={TrendingUp} />
              <StatCard label="منتجات ناقصة" value={d.summary.lowStockCount} icon={AlertCircle} iconColor={d.summary.lowStockCount > 0 ? "text-red-500" : "text-green-500"} iconBg={d.summary.lowStockCount > 0 ? "bg-red-50" : "bg-green-50"} />
            </div>
            {d.lowStock.length > 0 && (
              <SectionCard title={`منتجات تحت الحد الأدنى (${d.lowStock.length})`}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-right border-b border-[#f1f5f9]">
                      <th className="pb-2 font-medium text-[#64748b]">المنتج</th>
                      <th className="pb-2 font-medium text-[#64748b]">الكمية الحالية</th>
                      <th className="pb-2 font-medium text-[#64748b]">الحد الأدنى</th>
                      <th className="pb-2 font-medium text-[#64748b]">النقص</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f8fafc]">
                    {d.lowStock.map((p) => (
                      <tr key={p.id} className="hover:bg-[#f8fafc]">
                        <td className="py-2">
                          <Link href={`/inventory/${p.id}`} className="text-[#104e98] hover:underline font-medium">{p.name}</Link>
                          {p.sku && <span className="text-xs text-[#94a3b8] mr-1 ltr">({p.sku})</span>}
                        </td>
                        <td className="py-2 font-bold text-red-600">{p.stockQty}</td>
                        <td className="py-2 text-[#64748b]">{p.minStockQty}</td>
                        <td className="py-2 text-orange-500 font-medium">{p.minStockQty - p.stockQty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </SectionCard>
            )}
          </div>
        );
      })()}

      {/* Debts Aging Report */}
      {!loading && data && activeTab === "debts" && (() => {
        const d = data as {
          debts: Array<{ id: string; remaining: number; daysSince: number; bucket: string; customer: { id: string; name: string }; dueDate: string | null; createdAt: string }>;
          buckets: Record<string, { count: number; total: number }>;
          totalOutstanding: number;
        };
        return (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {Object.entries(d.buckets).map(([bucket, v]) => (
                <StatCard
                  key={bucket}
                  label={`${bucket} يوم`}
                  value={`₪${v.total.toFixed(2)}`}
                  icon={CreditCard}
                  iconColor={bucket === "90+" ? "text-red-600" : bucket === "61-90" ? "text-orange-500" : "text-yellow-500"}
                  iconBg={bucket === "90+" ? "bg-red-50" : bucket === "61-90" ? "bg-orange-50" : "bg-yellow-50"}
                />
              ))}
            </div>
            <SectionCard title={`الديون المعلقة — إجمالي ₪${d.totalOutstanding.toFixed(2)}`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-right border-b border-[#f1f5f9]">
                    <th className="pb-2 font-medium text-[#64748b]">العميل</th>
                    <th className="pb-2 font-medium text-[#64748b]">المتبقي</th>
                    <th className="pb-2 font-medium text-[#64748b]">منذ</th>
                    <th className="pb-2 font-medium text-[#64748b]">الفئة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f8fafc]">
                  {d.debts.map((debt) => (
                    <tr key={debt.id} className={`hover:bg-[#f8fafc] ${debt.bucket === "90+" ? "bg-red-50/30" : ""}`}>
                      <td className="py-2">
                        <Link href={`/customers/${debt.customer.id}`} className="text-[#104e98] hover:underline">{debt.customer.name}</Link>
                      </td>
                      <td className="py-2 font-medium ltr">₪{debt.remaining.toFixed(2)}</td>
                      <td className="py-2 text-[#64748b]">{debt.daysSince} يوم</td>
                      <td className="py-2">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          debt.bucket === "0-30" ? "bg-green-100 text-green-700" :
                          debt.bucket === "31-60" ? "bg-yellow-100 text-yellow-700" :
                          debt.bucket === "61-90" ? "bg-orange-100 text-orange-700" :
                          "bg-red-100 text-red-700"
                        }`}>{debt.bucket}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </SectionCard>
          </div>
        );
      })()}
    </div>
  );
}
