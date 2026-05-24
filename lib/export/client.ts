import { SHOP_INFO } from "@/lib/constants";
import { formatDate } from "@/lib/formatters";
import type { ExportDataset, ExportTable, ExportType } from "@/lib/export/datasets";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type ExportFormat = "pdf" | "xlsx";

/** Fetch the full filtered dataset from the server. */
export async function fetchExportDataset(
  type: ExportType,
  params: Record<string, string | undefined> = {}
): Promise<ExportDataset> {
  const sp = new URLSearchParams({ type });
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "" && v !== "all") sp.set(k, v);
  }
  const res = await fetch(`/api/export?${sp.toString()}`);
  const data = await res.json();
  if (!res.ok || data?.error) {
    throw new Error(data?.error ?? "تعذّر تجهيز التقرير");
  }
  return data as ExportDataset;
}

export function exportFilename(base: string, ext: ExportFormat): string {
  const today = new Date().toISOString().split("T")[0];
  return `${base}-${today}.${ext}`;
}

/** A single-table dataset is treated as one table named after its title. */
function datasetTables(dataset: ExportDataset): ExportTable[] {
  return dataset.tables && dataset.tables.length > 0
    ? dataset.tables
    : [{ name: dataset.title, columns: dataset.columns, rows: dataset.rows }];
}

export function datasetRowCount(dataset: ExportDataset): number {
  return datasetTables(dataset).reduce((sum, t) => sum + t.rows.length, 0);
}

// ── XLSX ─────────────────────────────────────────────────────────────────────

export async function datasetToXlsxBlob(dataset: ExportDataset): Promise<Blob> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  // Right-to-left sheet view to match the app's Arabic layout.
  wb.Workbook = { Views: [{ RTL: true }] };

  const usedNames = new Set<string>();
  datasetTables(dataset).forEach((table, idx) => {
    const { columns, rows } = table;
    const header = columns.map((c) => c.header);
    const body = rows.map((r) =>
      columns.map((c) => {
        const v = r[c.key];
        return v === "—" || v == null ? "" : v;
      })
    );
    const ws = XLSX.utils.aoa_to_sheet([header, ...body]);

    // Roughly size columns to the widest cell so Arabic headers aren't clipped.
    ws["!cols"] = columns.map((c) => {
      const width = Math.max(
        c.header.length,
        ...rows.map((r) => String(r[c.key] ?? "").length)
      );
      return { wch: Math.min(Math.max(width + 2, 8), 40) };
    });

    // Sheet names must be unique, ≤31 chars, and free of a few characters.
    const name = (table.name || `Sheet${idx + 1}`).replace(/[\\/?*[\]:]/g, "").slice(0, 31) || `Sheet${idx + 1}`;
    let unique = name;
    let n = 2;
    while (usedNames.has(unique)) {
      unique = `${name.slice(0, 28)} ${n++}`;
    }
    usedNames.add(unique);
    XLSX.utils.book_append_sheet(wb, ws, unique);
  });

  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new Blob([out], { type: XLSX_MIME });
}

// ── PDF ──────────────────────────────────────────────────────────────────────

function buildTableElement(table: ExportTable): HTMLElement {
  const { columns, rows } = table;
  const el = document.createElement("table");
  el.style.cssText =
    "width:100%;border-collapse:collapse;font-size:11px;table-layout:fixed;word-break:break-word;";

  const thead = document.createElement("thead");
  const trh = document.createElement("tr");
  for (const col of columns) {
    const th = document.createElement("th");
    th.textContent = col.header;
    th.style.cssText =
      "background:#104e98;color:#fff;text-align:right;padding:7px 8px;font-weight:600;border:1px solid #0b3d7a;";
    trh.appendChild(th);
  }
  thead.appendChild(trh);
  el.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.forEach((row, i) => {
    const tr = document.createElement("tr");
    tr.style.background = i % 2 === 0 ? "#ffffff" : "#f8fafc";
    for (const col of columns) {
      const td = document.createElement("td");
      const v = row[col.key];
      td.textContent = v == null || v === "" ? "—" : String(v);
      td.style.cssText =
        "padding:6px 8px;border:1px solid #e2e8f0;text-align:right;vertical-align:top;";
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });
  el.appendChild(tbody);
  return el;
}

function buildPdfTableNode(dataset: ExportDataset): HTMLElement {
  const tables = datasetTables(dataset);
  const multi = tables.length > 1;
  const total = tables.reduce((s, t) => s + t.rows.length, 0);

  const wrap = document.createElement("div");
  wrap.dir = "rtl";
  wrap.style.cssText = [
    "position:fixed",
    "left:-99999px",
    "top:0",
    "width:794px", // A4 width @ 96 DPI
    "background:#ffffff",
    "padding:32px",
    "box-sizing:border-box",
    "font-family:'Tajawal','Cairo','Segoe UI',Arial,sans-serif",
    "color:#0b2345",
  ].join(";");

  const head = document.createElement("div");
  head.style.cssText =
    "display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #104e98;padding-bottom:12px;margin-bottom:16px;";
  head.innerHTML = `
    <div>
      <div style="font-size:20px;font-weight:700;color:#104e98;">${escapeHtml(SHOP_INFO.name)}</div>
      <div style="font-size:12px;color:#64748b;">${escapeHtml(SHOP_INFO.address)} · ${escapeHtml(SHOP_INFO.phone)}</div>
    </div>
    <div style="text-align:left;">
      <div style="font-size:16px;font-weight:700;">${escapeHtml(dataset.title)}</div>
      <div style="font-size:11px;color:#64748b;">${escapeHtml(formatDate(new Date()))} · ${total} سجل</div>
    </div>`;
  wrap.appendChild(head);

  tables.forEach((table) => {
    if (multi) {
      const heading = document.createElement("div");
      heading.textContent = table.name;
      heading.style.cssText =
        "font-size:14px;font-weight:700;color:#0b2345;margin:18px 0 8px;";
      wrap.appendChild(heading);
    }
    if (table.rows.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "لا توجد بيانات";
      empty.style.cssText = "text-align:center;color:#94a3b8;padding:16px;font-size:13px;";
      wrap.appendChild(empty);
    } else {
      wrap.appendChild(buildTableElement(table));
    }
  });

  return wrap;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function datasetToPdfBlob(dataset: ExportDataset): Promise<Blob> {
  const node = buildPdfTableNode(dataset);
  document.body.appendChild(node);
  try {
    if (document.fonts && "ready" in document.fonts) {
      await document.fonts.ready;
    }
    await new Promise((r) => setTimeout(r, 50));

    const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
      import("html2canvas-pro"),
      import("jspdf"),
    ]);

    const canvas = await html2canvas(node, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      windowWidth: node.scrollWidth,
      windowHeight: node.scrollHeight,
    });

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidthMm = 210;
    const pageHeightMm = 297;
    const imgWidthMm = pageWidthMm;
    const imgHeightMm = (canvas.height * imgWidthMm) / canvas.width;
    const imgData = canvas.toDataURL("image/jpeg", 0.92);

    if (imgHeightMm <= pageHeightMm) {
      pdf.addImage(imgData, "JPEG", 0, 0, imgWidthMm, imgHeightMm);
    } else {
      let heightLeft = imgHeightMm;
      let position = 0;
      pdf.addImage(imgData, "JPEG", 0, position, imgWidthMm, imgHeightMm);
      heightLeft -= pageHeightMm;
      while (heightLeft > 0) {
        position -= pageHeightMm;
        pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, position, imgWidthMm, imgHeightMm);
        heightLeft -= pageHeightMm;
      }
    }

    return pdf.output("blob");
  } finally {
    node.remove();
  }
}

// ── Download / Share ──────────────────────────────────────────────────────────

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/**
 * Shares the file via the Web Share API on mobile (opens the OS share sheet →
 * WhatsApp, email, etc.). Falls back to a plain download on desktop or when
 * file sharing isn't supported. Returns how the file was delivered.
 */
export async function shareBlob(
  blob: Blob,
  filename: string,
  title: string
): Promise<"shared" | "downloaded" | "cancelled"> {
  const file = new File([blob], filename, { type: blob.type });

  const isMobile =
    typeof navigator !== "undefined" &&
    ((navigator as Navigator & { userAgentData?: { mobile?: boolean } })
      .userAgentData?.mobile ??
      /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent));

  const canShareFile =
    isMobile &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] });

  if (canShareFile) {
    try {
      await navigator.share({ files: [file], title });
      return "shared";
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return "cancelled";
      // Any other failure → fall through to download.
    }
  }

  downloadBlob(blob, filename);
  return "downloaded";
}
