"use client";

import { useState } from "react";
import { Download, FileText, FileSpreadsheet, Share2, Loader2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useToast } from "./Toast";
import {
  fetchExportDataset,
  datasetToXlsxBlob,
  datasetToPdfBlob,
  datasetRowCount,
  downloadBlob,
  shareBlob,
  exportFilename,
  type ExportFormat,
} from "@/lib/export/client";
import type { ExportType, ExportDataset } from "@/lib/export/datasets";

interface BaseProps {
  label?: string;
  size?: "sm" | "default";
  className?: string;
  disabled?: boolean;
}

/**
 * Either fetches a dataset from the server by `type` (list pages), or builds
 * one locally via `getDataset` (e.g. the reports page, whose aggregate data is
 * already in memory). `getDataset` returns null when no data is loaded yet.
 */
type Props = BaseProps &
  (
    | { type: ExportType; params?: Record<string, string | undefined>; getDataset?: never }
    | { getDataset: () => ExportDataset | null; type?: never; params?: never }
  );

type Action = "download-pdf" | "download-xlsx" | "share-pdf" | "share-xlsx";

export function ExportMenu(props: Props) {
  const { label = "تصدير", size = "default", className, disabled } = props;
  const [busy, setBusy] = useState<Action | null>(null);
  const { toast } = useToast();

  const run = async (action: Action) => {
    if (busy) return;
    setBusy(action);
    const format: ExportFormat = action.endsWith("xlsx") ? "xlsx" : "pdf";
    const share = action.startsWith("share");
    try {
      const dataset = props.getDataset
        ? props.getDataset()
        : await fetchExportDataset(props.type, props.params ?? {});
      if (!dataset || datasetRowCount(dataset) === 0) {
        toast("لا توجد بيانات للتصدير", "warning");
        return;
      }
      const blob =
        format === "xlsx"
          ? await datasetToXlsxBlob(dataset)
          : await datasetToPdfBlob(dataset);
      const filename = exportFilename(dataset.filename, format);

      if (share) {
        const result = await shareBlob(blob, filename, dataset.title);
        if (result === "downloaded") toast("تم تنزيل الملف", "success");
        else if (result === "shared") toast("تمت المشاركة", "success");
      } else {
        downloadBlob(blob, filename);
        toast("تم تنزيل الملف", "success");
      }
    } catch (e) {
      console.error("export failed:", e);
      toast(e instanceof Error ? e.message : "تعذّر تصدير التقرير", "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size} className={className} disabled={!!busy || disabled}>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {label}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[12rem]">
        <DropdownMenuLabel>تنزيل</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => run("download-pdf")}>
          <FileText className="h-4 w-4 text-red-500" />
          تنزيل PDF
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => run("download-xlsx")}>
          <FileSpreadsheet className="h-4 w-4 text-green-600" />
          تنزيل Excel
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>مشاركة</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => run("share-pdf")}>
          <Share2 className="h-4 w-4 text-[#104e98]" />
          مشاركة PDF
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => run("share-xlsx")}>
          <Share2 className="h-4 w-4 text-[#104e98]" />
          مشاركة Excel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
