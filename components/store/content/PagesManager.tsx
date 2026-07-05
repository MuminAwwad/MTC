"use client";

// Pages list + create/delete for the Storefront Content Studio.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Home, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard, FormField, ConfirmDialog } from "@/components/shared";
import { useToast } from "@/components/shared/Toast";
import type { StorePageSummary } from "@/lib/store/content";

export function PagesManager({ pages }: { pages: StorePageSummary[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [titleAr, setTitleAr] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [slug, setSlug] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<StorePageSummary | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  async function create() {
    setCreating(true);
    try {
      const res = await fetch("/api/store/content/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titleAr, titleEn, slug: slug || undefined }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) {
        toast(data?.error ?? "تعذّر إنشاء الصفحة", "error");
      } else {
        toast("تم إنشاء الصفحة كمسودة");
        router.push(`/store/content/${data.slug}`);
      }
    } finally {
      setCreating(false);
    }
  }

  async function remove() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    const res = await fetch(`/api/store/content/pages/${deleteTarget.slug}`, { method: "DELETE" });
    const data = await res.json();
    setDeleteLoading(false);
    setDeleteTarget(null);
    if (!res.ok || data?.error) {
      toast(data?.error ?? "تعذّر الحذف", "error");
    } else {
      toast("تم حذف الصفحة");
      router.refresh();
    }
  }

  return (
    <SectionCard
      title="صفحات المتجر"
      action={
        <Button size="sm" onClick={() => setCreateOpen((v) => !v)}>
          <Plus className="h-4 w-4" /> صفحة جديدة
        </Button>
      }
    >
      {createOpen && (
        <div className="rounded-lg border border-[#e2e8f0] p-4 mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <FormField label="العنوان (عربي)">
            <Input dir="rtl" value={titleAr} onChange={(e) => setTitleAr(e.target.value)} />
          </FormField>
          <FormField label="العنوان (إنجليزي)">
            <Input dir="ltr" value={titleEn} onChange={(e) => setTitleEn(e.target.value)} />
          </FormField>
          <FormField label="الرابط (اختياري)" hint="مثال: about-us">
            <Input dir="ltr" value={slug} onChange={(e) => setSlug(e.target.value)} />
          </FormField>
          <div className="sm:col-span-3 flex gap-2">
            <Button size="sm" disabled={creating || (!titleAr.trim() && !titleEn.trim() && !slug.trim())} onClick={create}>
              {creating ? "جارٍ الإنشاء..." : "إنشاء"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setCreateOpen(false)}>إلغاء</Button>
          </div>
        </div>
      )}

      <ul className="divide-y divide-[#f1f5f9]">
        {pages.map((p) => (
          <li key={p.slug} className="flex items-center gap-3 py-3">
            <span className="h-9 w-9 rounded-lg bg-[#e8f0fc] text-[#104e98] flex items-center justify-center">
              {p.kind === "system" ? <Home className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-[#1e293b]">
                {p.titleAr || p.titleEn || p.slug}
                {p.kind === "system" && (
                  <span className="mr-2 text-xs text-[#94a3b8]">صفحة نظامية</span>
                )}
              </p>
              <p className="text-xs text-[#94a3b8] ltr">/{p.slug === "home" ? "" : p.slug}</p>
            </div>
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                p.status === "published"
                  ? "bg-green-100 text-green-700"
                  : "bg-yellow-100 text-yellow-700"
              }`}
            >
              {p.status === "published" ? "منشورة" : "مسودة"}
            </span>
            <Button size="sm" variant="outline" asChild>
              <Link href={`/store/content/${p.slug}`}>
                <Pencil className="h-3.5 w-3.5" /> تحرير
              </Link>
            </Button>
            {p.kind === "custom" && (
              <Button
                size="icon-sm"
                variant="ghost"
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => setDeleteTarget(p)}
                aria-label={`حذف ${p.slug}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
        title="حذف الصفحة"
        description={`هل أنت متأكد من حذف صفحة "${deleteTarget?.titleAr || deleteTarget?.slug}" نهائياً؟`}
        confirmLabel="حذف"
        loading={deleteLoading}
      />
    </SectionCard>
  );
}
