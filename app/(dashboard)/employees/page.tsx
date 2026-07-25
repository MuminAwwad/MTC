"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, UserCog, Pencil, Trash2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PageHeader, SectionCard, FormField, EmptyState, CardSkeleton, StatusBadge, ConfirmDialog,
} from "@/components/shared";
import { USER_ROLE_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/formatters";
import type { UserRole } from "@prisma/client";

interface Employee {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

const emptyForm = { name: "", email: "", role: "STAFF" as UserRole, isActive: true };

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  // Add / edit employee form. `editingId` is null when inviting a new one.
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [deleteId, setDeleteId] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/employees");
    if (res.status === 403) {
      setForbidden(true);
    } else if (res.ok) {
      setForbidden(false);
      setEmployees(await res.json());
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFormError("");
    setShowForm(true);
  };

  const openEdit = (emp: Employee) => {
    setEditingId(emp.id);
    setForm({ name: emp.name, email: emp.email, role: emp.role, isActive: emp.isActive });
    setFormError("");
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormError("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setFormError("الاسم مطلوب"); return; }
    if (!editingId && !form.email.trim()) { setFormError("البريد الإلكتروني مطلوب"); return; }
    setSaving(true);
    setFormError("");

    const url = editingId ? `/api/employees/${editingId}` : "/api/employees";
    const method = editingId ? "PATCH" : "POST";
    const body = editingId
      ? { name: form.name, role: form.role, isActive: form.isActive }
      : { name: form.name, email: form.email, role: form.role };

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      closeForm();
      load();
    } else {
      const d = await res.json();
      setFormError(d.error ?? "حدث خطأ");
    }
    setSaving(false);
  };

  const deleteEmployee = async () => {
    setDeleteLoading(true);
    await fetch(`/api/employees/${deleteId}`, { method: "DELETE" });
    setDeleteId("");
    setDeleteLoading(false);
    load();
  };

  if (forbidden) {
    return (
      <div className="space-y-6">
        <PageHeader title="الموظفون" breadcrumb={[{ label: "الرئيسية", href: "/dashboard" }, { label: "الموظفون" }]} />
        <EmptyState icon={Lock} title="هذه الصفحة للمدراء فقط" description="ليست لديك صلاحية للوصول إلى إدارة الموظفين" />
      </div>
    );
  }

  const deletingEmployee = employees.find((e) => e.id === deleteId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="الموظفون"
        subtitle={`${employees.length} موظف`}
        action={
          <Button className="gap-2" onClick={openCreate}>
            <Plus className="h-4 w-4" />دعوة موظف جديد
          </Button>
        }
        breadcrumb={[{ label: "الرئيسية", href: "/dashboard" }, { label: "الموظفون" }]}
      />

      {showForm && (
        <SectionCard title={editingId ? "تعديل بيانات الموظف" : "دعوة موظف جديد"}>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField label="الاسم" required>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="اسم الموظف" />
              </FormField>
              <FormField label="البريد الإلكتروني" required={!editingId} hint={editingId ? "لا يمكن تعديل البريد الإلكتروني" : undefined}>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="name@example.com"
                  dir="ltr"
                  disabled={!!editingId}
                />
              </FormField>
              <FormField label="الصلاحية">
                <select
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as UserRole }))}
                  className="w-full h-10 px-3 rounded-lg border border-[#e2e8f0] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#104e98]"
                >
                  {(Object.keys(USER_ROLE_LABELS) as UserRole[]).map((r) => (
                    <option key={r} value={r}>{USER_ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </FormField>
            </div>

            {editingId && (
              <FormField label="الحالة">
                <select
                  value={form.isActive ? "active" : "inactive"}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.value === "active" }))}
                  className="w-full sm:w-56 h-10 px-3 rounded-lg border border-[#e2e8f0] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#104e98]"
                >
                  <option value="active">نشط</option>
                  <option value="inactive">معطّل (لا يمكنه تسجيل الدخول)</option>
                </select>
              </FormField>
            )}

            {!editingId && (
              <p className="text-xs text-[#94a3b8]">
                سيصله بريد إلكتروني لتفعيل الحساب وتحديد كلمة السر. سيشارك نفس بيانات المحل (العملاء، الفواتير، المخزون...).
              </p>
            )}

            {formError && <p className="text-xs text-red-600">{formError}</p>}
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={closeForm}>إلغاء</Button>
              <Button type="submit" disabled={saving}>
                {saving ? "جاري الحفظ..." : editingId ? "حفظ التعديلات" : "إرسال الدعوة"}
              </Button>
            </div>
          </form>
        </SectionCard>
      )}

      {loading ? (
        <CardSkeleton />
      ) : employees.length === 0 ? (
        <EmptyState icon={UserCog} title="لا يوجد موظفون بعد" description="ادعُ أول موظف للبدء" action={{ label: "دعوة موظف جديد", onClick: openCreate }} />
      ) : (
        <>
          {/* Mobile: cards */}
          <ul className="md:hidden space-y-2">
            {employees.map((emp) => (
              <li key={emp.id} className="bg-white rounded-xl border border-[#e2e8f0] p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#1e293b]">{emp.name}</p>
                    <p className="text-xs text-[#94a3b8] mt-0.5 ltr text-left">{emp.email}</p>
                  </div>
                  <StatusBadge status={{ type: "custom", label: emp.isActive ? "نشط" : "معطّل", color: emp.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600" }} />
                </div>
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#f1f5f9]">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#f1f5f9] text-[#64748b]">
                    {USER_ROLE_LABELS[emp.role]}
                  </span>
                  <div className="flex items-center gap-3">
                    <button onClick={() => openEdit(emp)} className="text-[#94a3b8] hover:text-[#104e98]" aria-label="تعديل">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => setDeleteId(emp.id)} className="text-[#94a3b8] hover:text-red-500" aria-label="حذف">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <div className="hidden md:block bg-white rounded-xl border border-[#e2e8f0] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#f8fafc] border-b border-[#e2e8f0]">
                  <tr>
                    <th className="text-right px-4 py-3 font-medium text-[#64748b]">الاسم</th>
                    <th className="text-right px-4 py-3 font-medium text-[#64748b]">البريد الإلكتروني</th>
                    <th className="text-right px-4 py-3 font-medium text-[#64748b]">الصلاحية</th>
                    <th className="text-right px-4 py-3 font-medium text-[#64748b]">الحالة</th>
                    <th className="text-right px-4 py-3 font-medium text-[#64748b]">تاريخ الانضمام</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f9]">
                  {employees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-[#f8fafc] transition-colors">
                      <td className="px-4 py-3 text-[#1e293b]">{emp.name}</td>
                      <td className="px-4 py-3 text-[#64748b] ltr text-left">{emp.email}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#f1f5f9] text-[#64748b]">
                          {USER_ROLE_LABELS[emp.role]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={{ type: "custom", label: emp.isActive ? "نشط" : "معطّل", color: emp.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600" }} />
                      </td>
                      <td className="px-4 py-3 text-[#64748b]">{formatDate(emp.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 justify-end">
                          <button onClick={() => openEdit(emp)} className="text-[#94a3b8] hover:text-[#104e98]" aria-label="تعديل">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button onClick={() => setDeleteId(emp.id)} className="text-[#94a3b8] hover:text-red-500" aria-label="حذف">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId("")}
        onConfirm={deleteEmployee}
        title="حذف الموظف"
        description={`هل أنت متأكد من حذف "${deletingEmployee?.name ?? ""}"؟ لن يتمكن من تسجيل الدخول بعد الآن.`}
        confirmLabel="حذف"
        loading={deleteLoading}
      />
    </div>
  );
}
