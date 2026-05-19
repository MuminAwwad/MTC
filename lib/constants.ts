import type {
  InvoiceStatus,
  TicketStatus,
  TicketPriority,
  DeviceType,
  Currency,
  UserRole,
  DebtStatus,
  StockMovementType,
} from "@prisma/client";

export const SHOP_INFO = {
  name: "MTC Electronics",
  nameAr: "MTC Electronics",
  phone: "0599880618",
  address: "نابلس، فلسطين",
  addressEn: "Nablus, Palestine",
} as const;

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  DRAFT: "مسودة",
  ISSUED: "مُصدرة",
  PAID: "مدفوعة",
  PARTIAL: "مدفوعة جزئيًا",
  CANCELLED: "ملغاة",
};

export const INVOICE_STATUS_COLORS: Record<InvoiceStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  ISSUED: "bg-blue-100 text-blue-700",
  PAID: "bg-green-100 text-green-700",
  PARTIAL: "bg-yellow-100 text-yellow-700",
  CANCELLED: "bg-red-100 text-red-700",
};

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  RECEIVED: "مستلم",
  DIAGNOSING: "تشخيص",
  IN_REPAIR: "قيد الإصلاح",
  WAITING_PARTS: "انتظار قطع",
  READY: "جاهز",
  DELIVERED: "مُسلَّم",
  CANCELLED: "ملغي",
};

export const TICKET_STATUS_COLORS: Record<TicketStatus, string> = {
  RECEIVED: "bg-gray-100 text-gray-700",
  DIAGNOSING: "bg-blue-100 text-blue-700",
  IN_REPAIR: "bg-orange-100 text-orange-700",
  WAITING_PARTS: "bg-yellow-100 text-yellow-700",
  READY: "bg-green-100 text-green-700",
  DELIVERED: "bg-purple-100 text-purple-700",
  CANCELLED: "bg-red-100 text-red-700",
};

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  LOW: "منخفضة",
  NORMAL: "عادية",
  HIGH: "عالية",
  URGENT: "عاجلة",
};

export const TICKET_PRIORITY_COLORS: Record<TicketPriority, string> = {
  LOW: "bg-gray-100 text-gray-600",
  NORMAL: "bg-blue-100 text-blue-700",
  HIGH: "bg-orange-100 text-orange-700",
  URGENT: "bg-red-100 text-red-700",
};

export const DEVICE_TYPE_LABELS: Record<DeviceType, string> = {
  MOBILE: "هاتف محمول",
  LAPTOP: "لابتوب",
  DESKTOP: "كمبيوتر مكتبي",
  TABLET: "تابلت",
  OTHER: "أخرى",
};

export const CURRENCY_LABELS: Record<Currency, string> = {
  ILS: "شيكل (₪)",
  USD: "دولار ($)",
  JOD: "دينار أردني (JD)",
};

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "مدير",
  STAFF: "موظف",
};

export const DEBT_STATUS_LABELS: Record<DebtStatus, string> = {
  PENDING: "معلق",
  PARTIAL: "مدفوع جزئيًا",
  PAID: "مدفوع",
};

export const DEBT_STATUS_COLORS: Record<DebtStatus, string> = {
  PENDING: "bg-red-100 text-red-700",
  PARTIAL: "bg-yellow-100 text-yellow-700",
  PAID: "bg-green-100 text-green-700",
};

export const STOCK_MOVEMENT_LABELS: Record<StockMovementType, string> = {
  IN: "إضافة",
  OUT: "صرف",
  ADJUSTMENT: "تعديل",
};

export const ITEMS_PER_PAGE = 20;

export const TICKET_FLOW: TicketStatus[] = [
  "RECEIVED",
  "DIAGNOSING",
  "IN_REPAIR",
  "WAITING_PARTS",
  "READY",
  "DELIVERED",
];
