"use client";

import { Search, X } from "lucide-react";
import { useState, useEffect } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";

interface SearchInputProps {
  placeholder?: string;
  onSearch: (value: string) => void;
  className?: string;
  defaultValue?: string;
}

export function SearchInput({
  placeholder = "بحث...",
  onSearch,
  className,
  defaultValue = "",
}: SearchInputProps) {
  const [value, setValue] = useState(defaultValue);
  const debounced = useDebounce(value, 300);

  useEffect(() => {
    onSearch(debounced);
  }, [debounced, onSearch]);

  return (
    <div className={cn("relative", className)}>
      <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94a3b8]" />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="w-full h-10 pr-10 pl-10 rounded-lg border border-[#e2e8f0] bg-white text-sm text-[#1e293b] placeholder:text-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#104e98] focus:border-transparent transition-colors"
        dir="rtl"
      />
      {value && (
        <button
          onClick={() => setValue("")}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8] hover:text-[#64748b] transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
