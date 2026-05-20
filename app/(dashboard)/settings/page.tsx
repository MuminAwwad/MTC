"use client";

import { useState, useEffect } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, SectionCard, FormField } from "@/components/shared";
import { SHOP_INFO } from "@/lib/constants";

interface ExpenseCategory { id: string; name: string; icon: string | null }

export default function SettingsPage() {
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [newCatName, setNewCatName] = useState("");
  const [savingCat, setSavingCat] = useState(false);
  const [catMsg, setCatMsg] = useState("");
  const [catError, setCatError] = useState("");
  const [deletingCat, setDeletingCat] = useState("");

  useEffect(() => {
    fetch("/api/expense-categories").then((r) => r.json()).then(setCategories).catch(() => {});
  }, []);

  const addCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    setSavingCat(true);
    setCatError("");
    const res = await fetch("/api/expense-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newCatName }),
    });
    const data = await res.json();
    if (res.ok) {
      setCategories((c) => [...c, data]);
      setNewCatName("");
      setCatMsg("تمت الإضافة");
      setTimeout(() => setCatMsg(""), 2000);
    } else {
      setCatError(data.error ?? "حدث خطأ");
    }
    setSavingCat(false);
  };

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="الإعدادات"
        breadcrumb={[{ label: "الرئيسية", href: "/dashboard" }, { label: "الإعدادات" }]}
      />

      {/* Shop info (read-only display — edit via .env/constants) */}
      <SectionCard title="معلومات المتجر">
        <dl className="space-y-3 text-sm">
          {[
            { label: "الاسم", value: SHOP_INFO.nameAr },
            { label: "الاسم (إنجليزي)", value: SHOP_INFO.name },
            { label: "رقم الهاتف", value: SHOP_INFO.phone },
            { label: "العنوان", value: SHOP_INFO.address },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center gap-4">
              <dt className="w-32 text-[#64748b] flex-shrink-0">{label}</dt>
              <dd className="font-medium text-[#1e293b]">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-[#94a3b8] mt-4">لتعديل هذه المعلومات، يُرجى تحديث ملف <code className="bg-[#f1f5f9] px-1 rounded">lib/constants.ts</code></p>
      </SectionCard>

      {/* Expense categories */}
      <SectionCard title="فئات المصاريف">
        <div className="space-y-3 mb-4">
          {categories.length === 0 ? (
            <p className="text-sm text-[#94a3b8]">لا توجد فئات مضافة بعد</p>
          ) : (
            <ul className="divide-y divide-[#f1f5f9]">
              {categories.map((cat) => (
                <li key={cat.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="font-medium text-[#1e293b]">{cat.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <form onSubmit={addCategory} className="flex gap-2 items-end">
          <FormField label="اسم الفئة" className="flex-1">
            <Input
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="مثال: إيجار، كهرباء..."
            />
          </FormField>
          <Button type="submit" disabled={savingCat || !newCatName.trim()} className="mb-0">
            <Save className="h-4 w-4" />
          </Button>
        </form>
        {catMsg && <p className="text-xs text-green-600 mt-2">{catMsg}</p>}
        {catError && <p className="text-xs text-red-600 mt-2">{catError}</p>}
      </SectionCard>

      {/* System info */}
      <SectionCard title="النظام">
        <dl className="space-y-2 text-sm">
          {[
            { label: "الإصدار", value: "1.0.0" },
            { label: "قاعدة البيانات", value: "PostgreSQL (Supabase)" },
            { label: "الإطار", value: "Next.js 16 + Prisma v7" },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center gap-4">
              <dt className="w-32 text-[#64748b] flex-shrink-0">{label}</dt>
              <dd className="font-medium text-[#1e293b]">{value}</dd>
            </div>
          ))}
        </dl>
      </SectionCard>
    </div>
  );
}
