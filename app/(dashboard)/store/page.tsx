import Link from "next/link";
import { sql } from "drizzle-orm";
import { ShoppingBag, Eye, FileClock, AlertTriangle, Database } from "lucide-react";
import { StatCard, SectionCard, EmptyState } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { getStoreDb, hasStoreDb } from "@/lib/store/db";
import { storeProducts } from "@/lib/store/schema";
import { getStoreImportRuns } from "@/lib/store/catalog";
import { formatDateTime } from "@/lib/formatters";

// Live counts from the store DB; syncs land on a cron, so keep it fresh.
export const dynamic = "force-dynamic";

async function getStoreStats() {
  const db = getStoreDb();
  if (!db) return null;
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      published: sql<number>`count(*) filter (where ${storeProducts.status} = 'published')::int`,
      drafts: sql<number>`count(*) filter (where ${storeProducts.status} = 'draft')::int`,
      archived: sql<number>`count(*) filter (where ${storeProducts.status} = 'archived')::int`,
      physical: sql<number>`count(*) filter (where ${storeProducts.kind} = 'physical')::int`,
      digital: sql<number>`count(*) filter (where ${storeProducts.kind} = 'digital')::int`,
      lowStock: sql<number>`count(*) filter (where ${storeProducts.kind} = 'physical' and ${storeProducts.stockQty} <= ${storeProducts.lowStockThreshold})::int`,
      inactive: sql<number>`count(*) filter (where ${storeProducts.active} = false)::int`,
    })
    .from(storeProducts);
  return row;
}

export default async function StoreOverviewPage() {
  if (!hasStoreDb()) {
    return (
      <EmptyState
        icon={Database}
        title="قاعدة بيانات المتجر غير مهيأة"
        description="أضف STORE_DATABASE_URL إلى متغيرات البيئة ثم أعد تشغيل التطبيق."
      />
    );
  }

  const [stats, runs] = await Promise.all([getStoreStats(), getStoreImportRuns(5)]);
  const lastRun = runs[0];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={ShoppingBag}
          label="منتجات المتجر"
          value={stats?.total ?? 0}
          iconColor="text-[#104e98]"
          iconBg="bg-[#e8f0fc]"
        />
        <StatCard
          icon={Eye}
          label="منشور للعملاء"
          value={stats?.published ?? 0}
          iconColor="text-green-600"
          iconBg="bg-green-100"
        />
        <StatCard
          icon={FileClock}
          label="بانتظار المراجعة"
          value={stats?.drafts ?? 0}
          iconColor={stats && stats.drafts > 0 ? "text-yellow-600" : "text-green-600"}
          iconBg={stats && stats.drafts > 0 ? "bg-yellow-100" : "bg-green-100"}
        />
        <StatCard
          icon={AlertTriangle}
          label="مخزون منخفض بالمتجر"
          value={stats?.lowStock ?? 0}
          iconColor={stats && stats.lowStock > 0 ? "text-red-600" : "text-green-600"}
          iconBg={stats && stats.lowStock > 0 ? "bg-red-100" : "bg-green-100"}
        />
      </div>

      {stats && stats.drafts > 0 && (
        <SectionCard>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium text-[#1e293b]">
                {stats.drafts} منتج بانتظار المراجعة
              </p>
              <p className="text-sm text-[#64748b] mt-0.5">
                المنتجات المزامنة تصل كمسودات مخفية عن العملاء حتى تتم مراجعتها ونشرها.
              </p>
            </div>
            <Button asChild size="sm">
              <Link href="/store/products?status=draft">مراجعة المسودات</Link>
            </Button>
          </div>
        </SectionCard>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="الكتالوج">
          <dl className="space-y-3 text-sm">
            {[
              ["منتجات مادية", stats?.physical ?? 0],
              ["منتجات رقمية", stats?.digital ?? 0],
              ["مؤرشف", stats?.archived ?? 0],
              ["محذوف من المصدر (غير نشط)", stats?.inactive ?? 0],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between">
                <dt className="text-[#64748b]">{label}</dt>
                <dd className="font-semibold text-[#1e293b]">{value}</dd>
              </div>
            ))}
          </dl>
        </SectionCard>

        <SectionCard title="آخر المزامنات">
          {runs.length === 0 ? (
            <p className="text-sm text-[#64748b]">لا توجد عمليات مزامنة بعد.</p>
          ) : (
            <ul className="space-y-3 text-sm">
              {runs.map((run) => (
                <li key={run.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[#1e293b] truncate">
                      {run.source === "scheduled"
                        ? "مزامنة مجدولة"
                        : run.source === "upload"
                        ? `استيراد ملف${run.filename ? `: ${run.filename}` : ""}`
                        : "مزامنة يدوية"}
                    </p>
                    <p className="text-xs text-[#94a3b8]">{formatDateTime(run.createdAt)}</p>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
                      run.status === "ok"
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {run.status === "ok"
                      ? `${run.productsUpserted} منتج`
                      : "فشلت"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {lastRun && (
        <p className="text-xs text-[#94a3b8]">
          آخر مزامنة: {formatDateTime(lastRun.createdAt)} —{" "}
          {lastRun.status === "ok" ? "ناجحة" : "فاشلة"}
        </p>
      )}
    </div>
  );
}
