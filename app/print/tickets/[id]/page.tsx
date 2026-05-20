import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SHOP_INFO, TICKET_STATUS_LABELS, DEVICE_TYPE_LABELS, TICKET_PRIORITY_LABELS } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/formatters";
import PrintButton from "./PrintButton";

export default async function PrintTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ticket = await prisma.maintenanceTicket.findFirst({
    where: { id, isDeleted: false },
    include: {
      customer: true,
      parts: true,
    },
  });
  if (!ticket) notFound();

  const partsTotal = ticket.parts.reduce((s, p) => s + Number(p.total), 0);

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
          @page { size: A5; margin: 10mm; }
        }
        body { font-family: var(--font-arabic, 'IBM Plex Sans Arabic', sans-serif); }
      `}</style>

      <div className="no-print fixed top-4 left-4 flex gap-2 z-10">
        <PrintButton />
        <a href={`/maintenance/${id}`} className="px-4 py-2 text-sm border rounded-lg bg-white hover:bg-gray-50">
          العودة
        </a>
      </div>

      <div className="max-w-[148mm] mx-auto p-6 min-h-screen">
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-6 pb-4 border-b-2 border-[#104e98]">
          <img src="/logo-blue.png" alt={SHOP_INFO.name} className="h-20 w-20 object-contain mb-2" />
          <h1 className="text-xl font-bold text-[#0b2345]">{SHOP_INFO.name}</h1>
          <p className="text-xs text-[#64748b]">{SHOP_INFO.address} · {SHOP_INFO.phone}</p>
          <p className="text-lg font-bold text-[#104e98] mt-3 ltr">{ticket.ticketNumber}</p>
          <p className="text-xs text-[#94a3b8]">وصل استلام جهاز</p>
        </div>

        {/* Customer */}
        <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-[#64748b] mb-0.5">العميل</p>
            <p className="font-semibold text-[#0b2345]">{ticket.customer.name}</p>
            {ticket.customer.phone && <p className="text-xs ltr text-[#64748b]">{ticket.customer.phone}</p>}
          </div>
          <div className="text-left">
            <p className="text-xs text-[#64748b] mb-0.5">تاريخ الاستلام</p>
            <p className="font-medium">{formatDate(ticket.createdAt)}</p>
            {ticket.estimatedDelivery && (
              <>
                <p className="text-xs text-[#64748b] mt-1 mb-0.5">الموعد المتوقع</p>
                <p className="font-medium">{formatDate(ticket.estimatedDelivery)}</p>
              </>
            )}
          </div>
        </div>

        {/* Device */}
        <div className="bg-[#f8fafc] rounded-xl p-3 mb-4 text-sm">
          <p className="text-xs font-semibold text-[#64748b] mb-2">بيانات الجهاز</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            <div>
              <span className="text-[#94a3b8] text-xs">النوع: </span>
              <span className="font-medium">{DEVICE_TYPE_LABELS[ticket.deviceType]}</span>
            </div>
            {ticket.deviceBrand && (
              <div>
                <span className="text-[#94a3b8] text-xs">الماركة: </span>
                <span className="font-medium">{ticket.deviceBrand}</span>
              </div>
            )}
            {ticket.deviceModel && (
              <div>
                <span className="text-[#94a3b8] text-xs">الموديل: </span>
                <span className="font-medium">{ticket.deviceModel}</span>
              </div>
            )}
            {ticket.serialNumber && (
              <div className="col-span-2">
                <span className="text-[#94a3b8] text-xs">الرقم التسلسلي: </span>
                <span className="font-medium ltr">{ticket.serialNumber}</span>
              </div>
            )}
            <div>
              <span className="text-[#94a3b8] text-xs">الحالة: </span>
              <span className="font-medium">{TICKET_STATUS_LABELS[ticket.status]}</span>
            </div>
            <div>
              <span className="text-[#94a3b8] text-xs">الأولوية: </span>
              <span className="font-medium">{TICKET_PRIORITY_LABELS[ticket.priority]}</span>
            </div>
          </div>
        </div>

        {/* Problem */}
        <div className="mb-4 text-sm">
          <p className="text-xs font-semibold text-[#64748b] mb-1">وصف المشكلة</p>
          <p className="text-[#1e293b] whitespace-pre-line">{ticket.problemDescription}</p>
        </div>

        {ticket.diagnosis && (
          <div className="mb-4 text-sm">
            <p className="text-xs font-semibold text-[#64748b] mb-1">التشخيص</p>
            <p className="text-[#1e293b] whitespace-pre-line">{ticket.diagnosis}</p>
          </div>
        )}

        {/* Parts */}
        {ticket.parts.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-[#64748b] mb-2">قطع الغيار</p>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#104e98] text-white">
                  <th className="text-right px-2 py-1.5 rounded-tr-md">القطعة</th>
                  <th className="text-center px-2 py-1.5">الكمية</th>
                  <th className="text-left px-2 py-1.5 rounded-tl-md">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {ticket.parts.map((p, i) => (
                  <tr key={p.id} className={i % 2 === 0 ? "bg-white" : "bg-[#f8fafc]"}>
                    <td className="px-2 py-1.5">{p.name}</td>
                    <td className="px-2 py-1.5 text-center">{p.qty}</td>
                    <td className="px-2 py-1.5 ltr text-left">₪{Number(p.total).toFixed(2)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-[#104e98] font-bold">
                  <td colSpan={2} className="px-2 py-1.5">الإجمالي</td>
                  <td className="px-2 py-1.5 ltr text-left">₪{partsTotal.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Pricing summary */}
        <div className="border-t border-[#e2e8f0] pt-3 text-sm space-y-1.5">
          {ticket.estimatedCost && (
            <div className="flex justify-between">
              <span className="text-[#64748b]">التكلفة التقديرية</span>
              <span>₪{Number(ticket.estimatedCost).toFixed(2)}</span>
            </div>
          )}
          {Number(ticket.finalCost) > 0 && (
            <div className="flex justify-between font-bold text-[#0b2345]">
              <span>التكلفة النهائية</span>
              <span className="ltr">₪{Number(ticket.finalCost).toFixed(2)}</span>
            </div>
          )}
          {Number(ticket.depositPaid) > 0 && (
            <div className="flex justify-between text-green-600">
              <span>عربون مدفوع</span>
              <span className="ltr">₪{Number(ticket.depositPaid).toFixed(2)}</span>
            </div>
          )}
        </div>

        {ticket.customerNotes && (
          <div className="mt-4 p-3 bg-[#f8fafc] rounded-lg text-xs text-[#64748b]">
            <strong className="text-[#1e293b]">ملاحظات: </strong>{ticket.customerNotes}
          </div>
        )}

        {/* Signatures */}
        <div className="mt-6 grid grid-cols-2 gap-8 text-xs text-[#64748b]">
          <div>
            <div className="border-b border-[#e2e8f0] mb-1 h-8"></div>
            <p>توقيع العميل</p>
          </div>
          <div>
            <div className="border-b border-[#e2e8f0] mb-1 h-8"></div>
            <p>توقيع الموظف</p>
          </div>
        </div>

        <div className="mt-4 text-center text-xs text-[#94a3b8] border-t border-[#e2e8f0] pt-3">
          شكرًا لثقتكم بـ {SHOP_INFO.nameAr}
        </div>
      </div>
    </>
  );
}
