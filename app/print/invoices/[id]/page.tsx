import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { SHOP_INFO, INVOICE_STATUS_LABELS } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/formatters";
import { buildInvoiceWhatsAppUrl } from "@/lib/whatsapp";
import PrintButton from "./PrintButton";

export default async function PrintInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pdf?: string }>;
}) {
  const { id } = await params;
  // `?pdf=1` is set by InvoiceShareButton when it screenshots this page for
  // the WhatsApp PDF — we hide the action bar entirely so the customer's
  // PDF doesn't contain our own print/whatsapp/back buttons.
  const { pdf } = await searchParams;
  const isPdfCapture = pdf === "1";

  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  const isStaff = !!authUser;
  const invoice = await prisma.invoice.findFirst({
    where: { id, isDeleted: false },
    include: {
      customer: true,
      items: { include: { product: { select: { id: true, sku: true } } } },
      ticket: { select: { ticketNumber: true, deviceType: true, deviceBrand: true, deviceModel: true } },
    },
  });
  if (!invoice) notFound();

  const currencySymbol = invoice.currency === "ILS" ? "₪" : invoice.currency === "USD" ? "$" : "JD";
  const saleItems = invoice.items.filter((i) => i.source === "SALE");
  const ticketItems = invoice.items.filter((i) => i.source !== "SALE");
  const saleSubtotal = saleItems.reduce((s, i) => s + Number(i.total), 0);
  const ticketSubtotal = ticketItems.reduce((s, i) => s + Number(i.total), 0);
  const hasTicketSection = ticketItems.length > 0;

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { size: A4; margin: 12mm; }
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          thead { display: table-header-group; }
          tfoot { display: table-footer-group; }
        }
        body { font-family: var(--font-arabic, 'IBM Plex Sans Arabic', sans-serif); }
      `}</style>

      {/* Print/share buttons — hidden in print, and omitted entirely when
          the page is being captured for the WhatsApp PDF. */}
      {!isPdfCapture && (
      <div className="no-print fixed top-4 left-4 flex gap-2 z-10">
        <PrintButton />
        {isStaff && (
          <a
            href={buildInvoiceWhatsAppUrl({
              invoiceNumber: invoice.invoiceNumber,
              customerName: invoice.customer.name,
              customerPhone: invoice.customer.phone,
              currency: invoice.currency,
              total: Number(invoice.total),
              remaining: Number(invoice.remainingAmount),
            })}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 text-sm bg-[#25d366] text-white rounded-lg hover:bg-[#1da851]"
          >
            واتساب
          </a>
        )}
        {isStaff && (
          <a href={`/invoices/${id}`} className="px-4 py-2 text-sm border rounded-lg bg-white hover:bg-gray-50">
            العودة
          </a>
        )}
      </div>
      )}

      {/* A4 page */}
      <div className="max-w-[210mm] mx-auto p-8 min-h-screen">
        {/* Header */}
        <div className="flex justify-between items-start mb-8 pb-6 border-b-2 border-[#104e98] gap-6">
          <div className="flex items-center gap-4 min-w-0">
            <img src="/logo-blue.png" alt={SHOP_INFO.name} className="h-24 w-24 object-contain flex-shrink-0" />
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-[#0b2345] leading-tight">{SHOP_INFO.name}</h1>
              <p className="text-sm text-[#64748b] mt-1">{SHOP_INFO.address}</p>
              <p className="text-sm text-[#64748b] ltr">{SHOP_INFO.phone}</p>
            </div>
          </div>
          <div className="text-left flex-shrink-0">
            <div className="text-xs uppercase tracking-wider text-[#94a3b8]">فاتورة</div>
            <div className="text-2xl font-bold text-[#104e98] ltr">{invoice.invoiceNumber}</div>
            <div className="text-sm text-[#64748b] mt-1">{formatDate(invoice.createdAt)}</div>
            <div className={`mt-2 inline-block px-3 py-1 rounded-full text-xs font-medium ${
              invoice.status === "PAID"
                ? "bg-green-100 text-green-700"
                : invoice.status === "CANCELLED"
                ? "bg-red-100 text-red-700"
                : invoice.status === "PARTIAL"
                ? "bg-yellow-100 text-yellow-700"
                : "bg-blue-100 text-blue-700"
            }`}>
              {INVOICE_STATUS_LABELS[invoice.status]}
            </div>
          </div>
        </div>

        {/* Customer info */}
        <div className="mb-6 bg-[#f8fafc] rounded-xl p-4">
          <h2 className="text-sm font-semibold text-[#64748b] mb-2">بيانات العميل</h2>
          <p className="font-bold text-[#0b2345]">{invoice.customer.name}</p>
          {invoice.customer.phone && <p className="text-sm text-[#64748b] ltr">{invoice.customer.phone}</p>}
          {invoice.customer.address && <p className="text-sm text-[#64748b]">{invoice.customer.address}</p>}
        </div>

        {/* Sale section */}
        {(saleItems.length > 0 || !hasTicketSection) && (
          <>
            {hasTicketSection && (
              <h3 className="text-sm font-bold text-[#0b2345] mb-2 bg-[#e8f0fc] px-3 py-1.5 rounded-md inline-block">
                قسم البيع
              </h3>
            )}
            <table className="w-full text-sm mb-6" style={{ tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "5%" }} />
                <col />
                <col style={{ width: "10%" }} />
                <col style={{ width: "15%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "15%" }} />
              </colgroup>
              <thead>
                <tr className="bg-[#104e98] text-white">
                  <th className="text-right px-3 py-2.5 rounded-tr-lg">#</th>
                  <th className="text-right px-3 py-2.5">الصنف</th>
                  <th className="text-center px-3 py-2.5">الكمية</th>
                  <th className="text-left px-3 py-2.5">سعر الوحدة</th>
                  <th className="text-left px-3 py-2.5">الخصم</th>
                  <th className="text-left px-3 py-2.5 rounded-tl-lg">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {saleItems.map((item, i) => (
                  <tr key={item.id} className={i % 2 === 0 ? "bg-white" : "bg-[#f8fafc]"}>
                    <td className="px-3 py-2.5 text-[#94a3b8]">{i + 1}</td>
                    <td className="px-3 py-2.5 font-medium text-[#1e293b] break-words">
                      {item.name}
                      {item.product?.sku && <span className="text-xs text-[#94a3b8] mr-1 ltr">({item.product.sku})</span>}
                    </td>
                    <td className="px-3 py-2.5 text-center">{item.qty}</td>
                    <td className="px-3 py-2.5 ltr text-left">{currencySymbol}{Number(item.unitPrice).toFixed(2)}</td>
                    <td className="px-3 py-2.5 ltr text-left text-red-500">
                      {Number(item.discount) > 0 && `${currencySymbol}${Number(item.discount).toFixed(2)}`}
                    </td>
                    <td className="px-3 py-2.5 ltr text-left font-medium">
                      {currencySymbol}{Number(item.total).toFixed(2)}
                    </td>
                  </tr>
                ))}
                {hasTicketSection && (
                  <tr className="bg-[#f1f5f9] font-semibold">
                    <td colSpan={5} className="px-3 py-2 text-right text-[#0b2345]">مجموع البيع</td>
                    <td className="px-3 py-2 ltr text-left text-[#0b2345]">{currencySymbol}{saleSubtotal.toFixed(2)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </>
        )}

        {/* Ticket section */}
        {hasTicketSection && (
          <>
            <h3 className="text-sm font-bold text-[#0b2345] mb-2 bg-orange-100 px-3 py-1.5 rounded-md inline-flex items-center gap-2">
              قسم الصيانة
              {invoice.ticket && <span className="text-xs text-[#64748b] ltr">{invoice.ticket.ticketNumber}</span>}
            </h3>
            <table className="w-full text-sm mb-6" style={{ tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "5%" }} />
                <col />
                <col style={{ width: "15%" }} />
                <col style={{ width: "20%" }} />
              </colgroup>
              <thead>
                <tr className="bg-orange-500 text-white">
                  <th className="text-right px-3 py-2.5 rounded-tr-lg">#</th>
                  <th className="text-right px-3 py-2.5">الصنف</th>
                  <th className="text-center px-3 py-2.5">الكمية</th>
                  <th className="text-left px-3 py-2.5 rounded-tl-lg">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {ticketItems.map((item, i) => (
                  <tr key={item.id} className={i % 2 === 0 ? "bg-white" : "bg-orange-50/50"}>
                    <td className="px-3 py-2.5 text-[#94a3b8]">{i + 1}</td>
                    <td className="px-3 py-2.5 font-medium text-[#1e293b] break-words">
                      {item.name}
                      {item.source === "TICKET_LABOR" && <span className="text-xs text-[#94a3b8] mr-1">(أجور)</span>}
                    </td>
                    <td className="px-3 py-2.5 text-center">{item.qty}</td>
                    <td className="px-3 py-2.5 ltr text-left font-medium">
                      {currencySymbol}{Number(item.total).toFixed(2)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-orange-100 font-semibold">
                  <td colSpan={3} className="px-3 py-2 text-right text-[#0b2345]">مجموع الصيانة</td>
                  <td className="px-3 py-2 ltr text-left text-[#0b2345]">{currencySymbol}{ticketSubtotal.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </>
        )}

        {/* Totals */}
        <div className="flex justify-end mb-6" style={{ pageBreakInside: "avoid" }}>
          <dl className="w-64 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-[#64748b]">المجموع الفرعي</dt>
              <dd className="font-medium ltr">{currencySymbol}{Number(invoice.subtotal).toFixed(2)}</dd>
            </div>
            {Number(invoice.discountAmount) > 0 && (
              <div className="flex justify-between text-red-600">
                <dt>الخصم</dt>
                <dd className="ltr">- {currencySymbol}{Number(invoice.discountAmount).toFixed(2)}</dd>
              </div>
            )}
            {Number(invoice.taxAmount) > 0 && (
              <div className="flex justify-between">
                <dt className="text-[#64748b]">ضريبة ({Number(invoice.taxPercent)}%)</dt>
                <dd className="ltr">{currencySymbol}{Number(invoice.taxAmount).toFixed(2)}</dd>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t-2 border-[#104e98] font-bold text-[#0b2345] text-base">
              <dt>الإجمالي</dt>
              <dd className="ltr">{currencySymbol}{Number(invoice.total).toFixed(2)}</dd>
            </div>
            {Number(invoice.paidAmount) > 0 && (
              <div className="flex justify-between text-green-600">
                <dt>مدفوع</dt>
                <dd className="ltr">{currencySymbol}{Number(invoice.paidAmount).toFixed(2)}</dd>
              </div>
            )}
            {Number(invoice.remainingAmount) > 0 && (
              <div className="flex justify-between text-orange-600 font-semibold">
                <dt>المتبقي</dt>
                <dd className="ltr">{currencySymbol}{Number(invoice.remainingAmount).toFixed(2)}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Notes */}
        {invoice.notes && (
          <div className="mb-6 p-4 bg-[#f8fafc] rounded-xl text-sm text-[#64748b]">
            <strong className="text-[#1e293b]">ملاحظات: </strong>
            {invoice.notes}
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-[#e2e8f0] pt-4 text-center text-xs text-[#94a3b8]">
          <p>شكرًا لتعاملكم مع {SHOP_INFO.nameAr}</p>
          <p className="ltr mt-1">{SHOP_INFO.phone} · {SHOP_INFO.address}</p>
        </div>
      </div>
    </>
  );
}
