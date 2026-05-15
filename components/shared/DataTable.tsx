"use client";

import { useState } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { LoadingSkeleton, EmptyState } from "./";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  sortable?: boolean;
  className?: string;
  headerClassName?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  keyExtractor: (row: T) => string;
  onSort?: (key: string, direction: "asc" | "desc") => void;
  sortKey?: string;
  sortDirection?: "asc" | "desc";
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  loading,
  emptyTitle = "لا توجد بيانات",
  emptyDescription,
  keyExtractor,
  onSort,
  sortKey,
  sortDirection,
  className,
}: DataTableProps<T>) {
  const handleSort = (key: string) => {
    if (!onSort) return;
    const dir = sortKey === key && sortDirection === "asc" ? "desc" : "asc";
    onSort(key, dir);
  };

  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#e2e8f0]">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "px-4 py-3 text-right text-xs font-semibold text-[#64748b] whitespace-nowrap",
                  col.sortable && "cursor-pointer hover:text-[#1e293b] select-none",
                  col.headerClassName
                )}
                onClick={() => col.sortable && handleSort(col.key)}
              >
                <div className="flex items-center gap-1 justify-end">
                  {col.header}
                  {col.sortable && (
                    <span className="text-[#94a3b8]">
                      {sortKey === col.key ? (
                        sortDirection === "asc" ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )
                      ) : (
                        <ChevronsUpDown className="h-3 w-3" />
                      )}
                    </span>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length} className="p-0">
                <LoadingSkeleton rows={5} columns={columns.length} />
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>
                <EmptyState title={emptyTitle} description={emptyDescription} />
              </td>
            </tr>
          ) : (
            data.map((row) => (
              <tr
                key={keyExtractor(row)}
                className="border-b border-[#f8fafc] hover:bg-[#fafbfc] transition-colors"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn("px-4 py-3 text-[#1e293b]", col.className)}
                  >
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
