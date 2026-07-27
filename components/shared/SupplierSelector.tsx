"use client";

import { useState, useEffect, useRef } from "react";
import { Search, Plus, X, Truck } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";

interface SupplierOption {
  id: string;
  name: string;
  phone: string | null;
  company?: string | null;
}

interface SupplierSelectorProps {
  value: string;
  onChange: (id: string, supplier?: SupplierOption) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
}

export function SupplierSelector({
  value,
  onChange,
  placeholder = "ابحث عن مورد أو أضف جديد...",
  className,
  required,
}: SupplierSelectorProps) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<SupplierOption[]>([]);
  const [selected, setSelected] = useState<SupplierOption | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const debouncedQuery = useDebounce(query, 250);
  const ref = useRef<HTMLDivElement>(null);

  // Load selected supplier on mount
  useEffect(() => {
    if (value && !selected) {
      fetch(`/api/suppliers/${value}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.id) setSelected({ id: d.id, name: d.name, phone: d.phone, company: d.company });
        })
        .catch(() => {});
    }
  }, [value, selected]);

  // Search suppliers
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/suppliers?all=true&search=${encodeURIComponent(debouncedQuery)}`)
      .then((r) => r.json())
      .then((d) => setOptions(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, [debouncedQuery, open]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (s: SupplierOption) => {
    setSelected(s);
    onChange(s.id, s);
    setOpen(false);
    setQuery("");
  };

  const handleClear = () => {
    setSelected(null);
    onChange("", undefined);
  };

  const handleCreateSupplier = async () => {
    if (!newName.trim()) return;
    const res = await fetch("/api/suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, phone: newPhone || null }),
    });
    if (res.ok) {
      const s = await res.json();
      handleSelect(s);
      setCreating(false);
      setNewName("");
      setNewPhone("");
    }
  };

  if (selected) {
    return (
      <div className={cn("flex items-center gap-2 bg-[#e8f0fc] rounded-lg px-3 py-2", className)}>
        <Truck className="h-4 w-4 text-[#104e98] flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[#0b2345] truncate">{selected.name}</p>
          {selected.phone && (
            <p className="text-xs text-[#64748b] ltr">{selected.phone}</p>
          )}
        </div>
        <button onClick={handleClear} className="text-[#64748b] hover:text-[#1e293b]">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} className={cn("relative", className)}>
      <div
        className="flex items-center gap-2 h-10 px-3 rounded-lg border border-[#e2e8f0] bg-white cursor-text"
        onClick={() => setOpen(true)}
      >
        <Search className="h-4 w-4 text-[#94a3b8] flex-shrink-0" />
        <input
          className="flex-1 text-sm outline-none placeholder:text-[#94a3b8]"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          required={required}
        />
      </div>

      {open && (
        <div className="absolute top-full mt-1 w-full bg-white border border-[#e2e8f0] rounded-xl shadow-lg z-50 overflow-hidden">
          {loading ? (
            <div className="px-3 py-2 text-sm text-[#94a3b8]">جاري البحث...</div>
          ) : (
            <>
              {options.length === 0 && query && (
                <div className="px-3 py-2 text-sm text-[#94a3b8]">
                  لا توجد نتائج لـ "{query}"
                </div>
              )}
              <ul className="max-h-48 overflow-y-auto">
                {options.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center gap-2 px-3 py-2.5 hover:bg-[#f8fafc] cursor-pointer"
                    onClick={() => handleSelect(s)}
                  >
                    <Truck className="h-4 w-4 text-[#94a3b8] flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-[#1e293b]">{s.name}</p>
                      {(s.phone || s.company) && (
                        <p className="text-xs text-[#94a3b8]">
                          {[s.phone, s.company].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              <div className="border-t border-[#f1f5f9]">
                {!creating ? (
                  <button
                    className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-[#104e98] hover:bg-[#f8fafc] font-medium"
                    onClick={() => { setCreating(true); setNewName(query); }}
                  >
                    <Plus className="h-4 w-4" />
                    إضافة مورد جديد{query ? ` "${query}"` : ""}
                  </button>
                ) : (
                  <div className="p-3 space-y-2">
                    <input
                      autoFocus
                      className="w-full h-9 px-3 rounded-lg border border-[#e2e8f0] text-sm focus:outline-none focus:ring-2 focus:ring-[#104e98]"
                      placeholder="اسم المورد *"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                    />
                    <input
                      className="w-full h-9 px-3 rounded-lg border border-[#e2e8f0] text-sm focus:outline-none focus:ring-2 focus:ring-[#104e98] ltr"
                      placeholder="رقم الهاتف (اختياري)"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      dir="ltr"
                    />
                    <div className="flex gap-2">
                      <button
                        className="flex-1 bg-[#104e98] text-white text-xs rounded-lg py-1.5 hover:bg-[#0b3d7a]"
                        onClick={handleCreateSupplier}
                      >
                        إضافة
                      </button>
                      <button
                        className="flex-1 border border-[#e2e8f0] text-xs rounded-lg py-1.5 text-[#64748b] hover:bg-[#f8fafc]"
                        onClick={() => setCreating(false)}
                      >
                        إلغاء
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
