"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, FormField, SectionCard } from "@/components/shared";

export default function NewCustomerPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", phone: "", address: "", notes: "" });

  const set = (k: keyof typeof form, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError("اسم العميل مطلوب"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          phone: form.phone || null,
          address: form.address || null,
          notes: form.notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "حدث خطأ"); return; }
      router.push(`/customers/${data.id}`);
    } catch {
      setError("حدث خطأ في الاتصال");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl">
      <PageHeader
        title="إضافة عميل جديد"
        breadcrumb={[
          { label: "الرئيسية", href: "/dashboard" },
          { label: "العملاء", href: "/customers" },
          { label: "عميل جديد" },
        ]}
      />
      <form onSubmit={handleSubmit} className="space-y-4">
        <SectionCard>
          <div className="space-y-4">
            <FormField label="اسم العميل" htmlFor="name" required>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="الاسم الكامل"
                autoFocus
              />
            </FormField>
            <FormField label="رقم الهاتف" htmlFor="phone">
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="05xxxxxxxx"
                dir="ltr"
                type="tel"
              />
            </FormField>
            <FormField label="العنوان" htmlFor="address">
              <Input
                id="address"
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
                placeholder="المنطقة أو الحي (اختياري)"
              />
            </FormField>
            <FormField label="ملاحظات">
              <Textarea
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="ملاحظات إضافية..."
                rows={3}
              />
            </FormField>
          </div>
        </SectionCard>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
        )}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={loading}>
            إلغاء
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? "جاري الحفظ..." : "إضافة العميل"}
          </Button>
        </div>
      </form>
    </div>
  );
}
