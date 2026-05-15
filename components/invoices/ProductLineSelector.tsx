"use client";

import { useState, useEffect, useRef } from "react";
import { Search, Package } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";

interface ProductOption {
  id: string;
  name: string;
  sku: string | null;
  sellPrice: number;
  stockQty: number;
}

interface ProductLineSelectorProps {
  onSelect: (product: ProductOption) => void;
  placeholder?: string;
}

export function ProductLineSelector({ onSelect, placeholder = "ابحث عن منتج أو اكتب اسمًا..." }: ProductLineSelectorProps) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<ProductOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debouncedQuery = useDebounce(query, 250);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open && !debouncedQuery) return;
    setLoading(true);
    fetch(`/api/products?search=${encodeURIComponent(debouncedQuery)}&limit=10`)
      .then((r) => r.json())
      .then((d) => setOptions(Array.isArray(d.products) ? d.products : []))
      .catch(() => setOptions([]))
      .finally(() => setLoading(false));
  }, [debouncedQuery, open]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (p: ProductOption) => {
    onSelect(p);
    setQuery("");
    setOpen(false);
  };

  const handleCustom = () => {
    if (!query.trim()) return;
    onSelect({ id: "", name: query.trim(), sku: null, sellPrice: 0, stockQty: 999 });
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-2 h-9 px-3 rounded-lg border border-[#e2e8f0] bg-white focus-within:ring-2 focus-within:ring-[#104e98]">
        <Search className="h-4 w-4 text-[#94a3b8] flex-shrink-0" />
        <input
          className="flex-1 text-sm outline-none placeholder:text-[#94a3b8]"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
        />
      </div>

      {open && (
        <div className="absolute top-full mt-1 w-72 bg-white border border-[#e2e8f0] rounded-xl shadow-lg z-50 overflow-hidden">
          {loading ? (
            <div className="px-3 py-2 text-sm text-[#94a3b8]">جاري البحث...</div>
          ) : (
            <>
              <ul className="max-h-48 overflow-y-auto">
                {options.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center gap-2 px-3 py-2.5 hover:bg-[#f8fafc] cursor-pointer"
                    onClick={() => handleSelect(p)}
                  >
                    <Package className="h-4 w-4 text-[#94a3b8] flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#1e293b] truncate">{p.name}</p>
                      <p className="text-xs text-[#94a3b8]">
                        {p.sku && <span className="ltr">{p.sku} · </span>}
                        المخزون: {p.stockQty}
                      </p>
                    </div>
                    <span className="text-sm font-medium text-[#104e98] ltr">₪{Number(p.sellPrice).toFixed(2)}</span>
                  </li>
                ))}
              </ul>
              {query && (
                <div className="border-t border-[#f1f5f9]">
                  <button
                    className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-[#104e98] hover:bg-[#f8fafc] font-medium"
                    onClick={handleCustom}
                  >
                    <Package className="h-4 w-4" />
                    إضافة "{query}" كصنف يدوي
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
