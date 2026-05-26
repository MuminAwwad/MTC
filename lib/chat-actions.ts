import { prisma } from "./prisma";
import { decrementStockOrFail, InsufficientStockError } from "./stock";
import { generateInvoiceNumber, generateTicketNumber } from "./invoice-number";
import type {
  Currency,
  DeviceType,
  TicketStatus,
  TicketPriority,
  InvoiceStatus,
} from "@prisma/client";

/**
 * Write-capable "action" tools for the assistant. Every action follows a
 * confirm-first contract: the model calls a tool to PREVIEW a change (no
 * write — only validation, id resolution, and a human summary). The staged
 * action is shown to the user, and only on explicit confirmation does the
 * server run commit(). commit() re-validates everything by id, scoped to the
 * owner, so a tampered or stale client payload can never escape the shop.
 */

export interface StagedAction {
  kind: string;
  summary: string;
  warn?: string;
  payload: Record<string, unknown>;
}

export type PreviewResult =
  | { ok: true; action: StagedAction }
  | { ok: false; error: string };

export type CommitResult = { summary: string } | { error: string };

interface ActionToolDef {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  preview: (ownerId: string, args: Record<string, unknown>) => Promise<PreviewResult>;
  commit: (ownerId: string, userId: string, payload: Record<string, unknown>) => Promise<CommitResult>;
}

// ── helpers ───────────────────────────────────────────────────────────────────

const CURRENCY_SYMBOLS: Record<string, string> = { ILS: "₪", USD: "$", JOD: "JD" };
const VALID_CURRENCIES = ["ILS", "USD", "JOD"];
const DEVICE_TYPES = ["MOBILE", "LAPTOP", "DESKTOP", "TABLET", "OTHER"];
const TICKET_STATUSES = [
  "RECEIVED", "DIAGNOSING", "IN_REPAIR", "WAITING_PARTS", "READY", "DELIVERED", "CANCELLED",
];
const TICKET_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"];

const TICKET_STATUS_LABELS: Record<string, string> = {
  RECEIVED: "مستلم", DIAGNOSING: "تشخيص", IN_REPAIR: "قيد الإصلاح",
  WAITING_PARTS: "انتظار قطع", READY: "جاهز", DELIVERED: "مُسلَّم", CANCELLED: "ملغي",
};

const TICKET_TRANSITIONS: Record<string, string[]> = {
  RECEIVED: ["DIAGNOSING", "CANCELLED"],
  DIAGNOSING: ["IN_REPAIR", "WAITING_PARTS", "READY", "CANCELLED"],
  IN_REPAIR: ["WAITING_PARTS", "READY", "CANCELLED"],
  WAITING_PARTS: ["IN_REPAIR", "READY", "CANCELLED"],
  READY: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

const num = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : NaN;
};
const intOf = (v: unknown): number => Math.trunc(num(v));
const str = (v: unknown): string => (v == null ? "" : String(v)).trim();
const optStr = (v: unknown): string | null => {
  const s = str(v);
  return s.length ? s : null;
};
const fmt = (amount: number, currency = "ILS") =>
  `${CURRENCY_SYMBOLS[currency] ?? "₪"}${amount.toFixed(2)}`;

// ── action registry ─────────────────────────────────────────────────────────

const ACTIONS: ActionToolDef[] = [
  // ── customers ──────────────────────────────────────────────────────────────
  {
    name: "create_customer",
    description:
      "Create a new customer. Use when the user wants to add/register a customer. Requires a name; phone, address, and notes are optional.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Customer full name (required)." },
        phone: { type: "string", description: "Phone number (optional, must be unique within the shop)." },
        address: { type: "string" },
        notes: { type: "string" },
      },
      required: ["name"],
    },
    preview: async (ownerId, args) => {
      const name = str(args.name);
      if (!name) return { ok: false, error: "اسم العميل مطلوب" };
      const phone = optStr(args.phone);
      if (phone) {
        const dup = await prisma.customer.findFirst({
          where: { ownerId, phone, isDeleted: false }, select: { id: true },
        });
        if (dup) return { ok: false, error: `يوجد عميل برقم الهاتف ${phone} مسبقًا` };
      }
      return {
        ok: true,
        action: {
          kind: "create_customer",
          summary: `إضافة عميل جديد: ${name}${phone ? ` — ${phone}` : ""}`,
          payload: { name, phone, address: optStr(args.address), notes: optStr(args.notes) },
        },
      };
    },
    commit: async (ownerId, _userId, p) => {
      const phone = (p.phone as string | null) ?? null;
      if (phone) {
        const dup = await prisma.customer.findFirst({ where: { ownerId, phone, isDeleted: false }, select: { id: true } });
        if (dup) return { error: `رقم الهاتف ${phone} مستخدم مسبقًا` };
      }
      const c = await prisma.customer.create({
        data: {
          ownerId,
          name: p.name as string,
          phone,
          address: (p.address as string | null) ?? null,
          notes: (p.notes as string | null) ?? null,
        },
        select: { name: true },
      });
      return { summary: `تمت إضافة العميل "${c.name}".` };
    },
  },

  {
    name: "update_customer",
    description:
      "Update an existing customer's details. Resolve the customer id first with find_customer. Provide only the fields to change.",
    parameters: {
      type: "object",
      properties: {
        customerId: { type: "string", description: "Customer id (from find_customer)." },
        name: { type: "string" },
        phone: { type: "string" },
        address: { type: "string" },
        notes: { type: "string" },
      },
      required: ["customerId"],
    },
    preview: async (ownerId, args) => {
      const customerId = str(args.customerId);
      const customer = await prisma.customer.findFirst({
        where: { id: customerId, ownerId, isDeleted: false },
        select: { id: true, name: true },
      });
      if (!customer) return { ok: false, error: "العميل غير موجود" };
      const patch: Record<string, string | null> = {};
      if (args.name !== undefined) patch.name = str(args.name) || customer.name;
      if (args.phone !== undefined) patch.phone = optStr(args.phone);
      if (args.address !== undefined) patch.address = optStr(args.address);
      if (args.notes !== undefined) patch.notes = optStr(args.notes);
      if (Object.keys(patch).length === 0) return { ok: false, error: "لا توجد حقول للتعديل" };
      const parts = Object.entries(patch).map(([k, v]) => `${k}: ${v ?? "—"}`);
      return {
        ok: true,
        action: {
          kind: "update_customer",
          summary: `تعديل العميل "${customer.name}" (${parts.join("، ")})`,
          payload: { customerId, patch },
        },
      };
    },
    commit: async (ownerId, _userId, p) => {
      const customerId = p.customerId as string;
      const res = await prisma.customer.updateMany({
        where: { id: customerId, ownerId, isDeleted: false },
        data: p.patch as Record<string, string | null>,
      });
      if (res.count === 0) return { error: "العميل غير موجود" };
      return { summary: "تم تعديل بيانات العميل." };
    },
  },

  // ── suppliers ───────────────────────────────────────────────────────────────
  {
    name: "create_supplier",
    description: "Create a new supplier. Requires a name; phone, company, and notes are optional.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Supplier name (required)." },
        phone: { type: "string" },
        company: { type: "string" },
        notes: { type: "string" },
      },
      required: ["name"],
    },
    preview: async (ownerId, args) => {
      const name = str(args.name);
      if (!name) return { ok: false, error: "اسم المورد مطلوب" };
      const phone = optStr(args.phone);
      if (phone) {
        const dup = await prisma.supplier.findFirst({ where: { ownerId, phone, isDeleted: false }, select: { id: true } });
        if (dup) return { ok: false, error: `يوجد مورد برقم الهاتف ${phone} مسبقًا` };
      }
      return {
        ok: true,
        action: {
          kind: "create_supplier",
          summary: `إضافة مورد جديد: ${name}${phone ? ` — ${phone}` : ""}`,
          payload: { name, phone, company: optStr(args.company), notes: optStr(args.notes) },
        },
      };
    },
    commit: async (ownerId, _userId, p) => {
      const phone = (p.phone as string | null) ?? null;
      if (phone) {
        const dup = await prisma.supplier.findFirst({ where: { ownerId, phone, isDeleted: false }, select: { id: true } });
        if (dup) return { error: `رقم الهاتف ${phone} مستخدم مسبقًا` };
      }
      const s = await prisma.supplier.create({
        data: {
          ownerId,
          name: p.name as string,
          phone,
          company: (p.company as string | null) ?? null,
          notes: (p.notes as string | null) ?? null,
        },
        select: { name: true },
      });
      return { summary: `تمت إضافة المورد "${s.name}".` };
    },
  },

  // ── products ──────────────────────────────────────────────────────────────
  {
    name: "create_product",
    description:
      "Add a new product to inventory. Requires name and sellPrice. Optional: costPrice, sku, barcode, stockQty (opening stock), minStockQty, categoryName (created if new).",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        sellPrice: { type: "string", description: "Selling price (required)." },
        costPrice: { type: "string", description: "Cost price (defaults to sellPrice)." },
        sku: { type: "string" },
        barcode: { type: "string" },
        stockQty: { type: "string", description: "Opening stock quantity (default 0)." },
        minStockQty: { type: "string", description: "Low-stock threshold (default 0)." },
        categoryName: { type: "string" },
      },
      required: ["name", "sellPrice"],
    },
    preview: async (ownerId, args) => {
      const name = str(args.name);
      if (!name) return { ok: false, error: "اسم المنتج مطلوب" };
      const sellPrice = num(args.sellPrice);
      if (!Number.isFinite(sellPrice) || sellPrice < 0) return { ok: false, error: "سعر البيع غير صالح" };
      const costPrice = args.costPrice !== undefined && Number.isFinite(num(args.costPrice)) ? num(args.costPrice) : sellPrice;
      const sku = optStr(args.sku);
      if (sku) {
        const dup = await prisma.product.findFirst({ where: { ownerId, sku, isDeleted: false }, select: { id: true } });
        if (dup) return { ok: false, error: `يوجد منتج بنفس SKU (${sku})` };
      }
      const stockQty = Number.isFinite(num(args.stockQty)) ? Math.max(0, intOf(args.stockQty)) : 0;
      const minStockQty = Number.isFinite(num(args.minStockQty)) ? Math.max(0, intOf(args.minStockQty)) : 0;
      const categoryName = optStr(args.categoryName);
      return {
        ok: true,
        action: {
          kind: "create_product",
          summary: `إضافة منتج: ${name} — سعر البيع ${fmt(sellPrice)}، التكلفة ${fmt(costPrice)}، الكمية ${stockQty}${categoryName ? `، الفئة: ${categoryName}` : ""}`,
          payload: { name, sellPrice, costPrice, sku, barcode: optStr(args.barcode), stockQty, minStockQty, categoryName },
        },
      };
    },
    commit: async (ownerId, userId, p) => {
      const sku = (p.sku as string | null) ?? null;
      if (sku) {
        const dup = await prisma.product.findFirst({ where: { ownerId, sku, isDeleted: false }, select: { id: true } });
        if (dup) return { error: `SKU ${sku} مستخدم مسبقًا` };
      }
      const stockQty = p.stockQty as number;
      await prisma.$transaction(async (tx) => {
        let categoryId: string | null = null;
        const categoryName = p.categoryName as string | null;
        if (categoryName) {
          const existing = await tx.category.findFirst({
            where: { ownerId, name: { equals: categoryName, mode: "insensitive" }, isDeleted: false },
            select: { id: true },
          });
          if (existing) categoryId = existing.id;
          else {
            const slug = `${categoryName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9؀-ۿ-]/g, "").slice(0, 40)}-${Date.now()}`;
            const made = await tx.category.create({ data: { ownerId, name: categoryName, slug }, select: { id: true } });
            categoryId = made.id;
          }
        }
        const product = await tx.product.create({
          data: {
            ownerId,
            name: p.name as string,
            sku,
            barcode: (p.barcode as string | null) ?? null,
            costPrice: p.costPrice as number,
            sellPrice: p.sellPrice as number,
            stockQty,
            minStockQty: p.minStockQty as number,
            categoryId,
          },
          select: { id: true },
        });
        if (stockQty > 0) {
          await tx.stockMovement.create({
            data: { ownerId, productId: product.id, createdById: userId, type: "IN", qty: stockQty, note: "رصيد افتتاحي (المساعد الذكي)" },
          });
        }
      });
      return { summary: `تمت إضافة المنتج "${p.name as string}".` };
    },
  },

  {
    name: "update_product",
    description:
      "Update a product's details/prices. Resolve the product id first with find_product. Provide only fields to change (name, sellPrice, costPrice, minStockQty, sku, barcode). To change stock quantity use adjust_stock instead.",
    parameters: {
      type: "object",
      properties: {
        productId: { type: "string" },
        name: { type: "string" },
        sellPrice: { type: "string" },
        costPrice: { type: "string" },
        minStockQty: { type: "string" },
        sku: { type: "string" },
        barcode: { type: "string" },
      },
      required: ["productId"],
    },
    preview: async (ownerId, args) => {
      const productId = str(args.productId);
      const product = await prisma.product.findFirst({
        where: { id: productId, ownerId, isDeleted: false },
        select: { id: true, name: true },
      });
      if (!product) return { ok: false, error: "المنتج غير موجود" };
      const patch: Record<string, string | number | null> = {};
      const changes: string[] = [];
      if (args.name !== undefined && str(args.name)) { patch.name = str(args.name); changes.push(`الاسم: ${patch.name}`); }
      if (args.sellPrice !== undefined && Number.isFinite(num(args.sellPrice))) { patch.sellPrice = num(args.sellPrice); changes.push(`سعر البيع: ${fmt(patch.sellPrice as number)}`); }
      if (args.costPrice !== undefined && Number.isFinite(num(args.costPrice))) { patch.costPrice = num(args.costPrice); changes.push(`التكلفة: ${fmt(patch.costPrice as number)}`); }
      if (args.minStockQty !== undefined && Number.isFinite(num(args.minStockQty))) { patch.minStockQty = Math.max(0, intOf(args.minStockQty)); changes.push(`الحد الأدنى: ${patch.minStockQty}`); }
      if (args.sku !== undefined) { patch.sku = optStr(args.sku); changes.push(`SKU: ${patch.sku ?? "—"}`); }
      if (args.barcode !== undefined) { patch.barcode = optStr(args.barcode); changes.push(`الباركود: ${patch.barcode ?? "—"}`); }
      if (changes.length === 0) return { ok: false, error: "لا توجد حقول للتعديل" };
      return {
        ok: true,
        action: {
          kind: "update_product",
          summary: `تعديل المنتج "${product.name}" (${changes.join("، ")})`,
          payload: { productId, patch },
        },
      };
    },
    commit: async (ownerId, _userId, p) => {
      const res = await prisma.product.updateMany({
        where: { id: p.productId as string, ownerId, isDeleted: false },
        data: p.patch as Record<string, string | number | null>,
      });
      if (res.count === 0) return { error: "المنتج غير موجود" };
      return { summary: "تم تعديل المنتج." };
    },
  },

  {
    name: "adjust_stock",
    description:
      "Adjust a product's stock. type IN adds qty, OUT removes qty, ADJUSTMENT sets the stock to exactly qty. Resolve the product id first with find_product.",
    parameters: {
      type: "object",
      properties: {
        productId: { type: "string" },
        type: { type: "string", description: "IN | OUT | ADJUSTMENT" },
        qty: { type: "string", description: "Quantity (positive integer)." },
        note: { type: "string" },
      },
      required: ["productId", "type", "qty"],
    },
    preview: async (ownerId, args) => {
      const productId = str(args.productId);
      const type = str(args.type).toUpperCase();
      if (!["IN", "OUT", "ADJUSTMENT"].includes(type)) return { ok: false, error: "نوع الحركة يجب أن يكون IN أو OUT أو ADJUSTMENT" };
      const qty = intOf(args.qty);
      if (!Number.isFinite(qty) || qty <= 0) return { ok: false, error: "الكمية يجب أن تكون عددًا موجبًا" };
      const product = await prisma.product.findFirst({
        where: { id: productId, ownerId, isDeleted: false },
        select: { id: true, name: true, stockQty: true },
      });
      if (!product) return { ok: false, error: "المنتج غير موجود" };
      const after = type === "IN" ? product.stockQty + qty : type === "OUT" ? product.stockQty - qty : qty;
      const label = type === "IN" ? "إضافة" : type === "OUT" ? "صرف" : "تعديل إلى";
      const warn = type === "OUT" && qty > product.stockQty ? `الكمية المطلوبة (${qty}) أكبر من المتوفر (${product.stockQty}) — لن تتم العملية.` : undefined;
      return {
        ok: true,
        action: {
          kind: "adjust_stock",
          summary: `${label} ${qty} للمنتج "${product.name}" (المخزون: ${product.stockQty} ← ${after})`,
          warn,
          payload: { productId, type, qty, note: optStr(args.note) },
        },
      };
    },
    commit: async (ownerId, userId, p) => {
      const productId = p.productId as string;
      const type = p.type as "IN" | "OUT" | "ADJUSTMENT";
      const qty = p.qty as number;
      try {
        const newQty = await prisma.$transaction(async (tx) => {
          const product = await tx.product.findFirst({ where: { id: productId, ownerId, isDeleted: false }, select: { id: true } });
          if (!product) throw new Error("PRODUCT_NOT_FOUND");
          if (type === "OUT") await decrementStockOrFail(tx, productId, qty);
          else if (type === "IN") await tx.product.update({ where: { id: productId }, data: { stockQty: { increment: qty } } });
          else await tx.product.update({ where: { id: productId }, data: { stockQty: qty } });
          await tx.stockMovement.create({
            data: { ownerId, productId, type, qty, note: (p.note as string | null) ?? "تعديل مخزون (المساعد الذكي)", createdById: userId },
          });
          const updated = await tx.product.findUnique({ where: { id: productId }, select: { stockQty: true } });
          return updated?.stockQty ?? 0;
        });
        return { summary: `تم تحديث المخزون. الرصيد الحالي: ${newQty}.` };
      } catch (e) {
        if (e instanceof InsufficientStockError) return { error: e.message };
        if (e instanceof Error && e.message === "PRODUCT_NOT_FOUND") return { error: "المنتج غير موجود" };
        throw e;
      }
    },
  },

  // ── invoices / sales ─────────────────────────────────────────────────────────
  {
    name: "create_invoice",
    description:
      "Create a sales invoice for a customer. Resolve the customer id with find_customer first. items is an array of { name, qty, unitPrice, discount?, productId? } — set productId (from find_product) when the line is a stocked product so its stock is decremented. Optional: discountAmount, discountPercent, taxPercent, deliveryFee, paidAmount (amount paid now), currency (default ILS), status (DRAFT or ISSUED, default ISSUED). Any unpaid remainder becomes a customer debt automatically.",
    parameters: {
      type: "object",
      properties: {
        customerId: { type: "string" },
        items: {
          type: "array",
          description: "Line items.",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              qty: { type: "string" },
              unitPrice: { type: "string" },
              discount: { type: "string" },
              productId: { type: "string" },
            },
            required: ["name", "qty", "unitPrice"],
          },
        },
        discountAmount: { type: "string" },
        discountPercent: { type: "string" },
        taxPercent: { type: "string" },
        deliveryFee: { type: "string" },
        paidAmount: { type: "string" },
        currency: { type: "string" },
        status: { type: "string", description: "DRAFT or ISSUED (default ISSUED)." },
      },
      required: ["customerId", "items"],
    },
    preview: async (ownerId, args) => {
      const customerId = str(args.customerId);
      const customer = await prisma.customer.findFirst({
        where: { id: customerId, ownerId, isDeleted: false },
        select: { id: true, name: true },
      });
      if (!customer) return { ok: false, error: "العميل غير موجود" };

      const rawItems = Array.isArray(args.items) ? (args.items as Record<string, unknown>[]) : [];
      if (rawItems.length === 0) return { ok: false, error: "يجب إضافة صنف واحد على الأقل" };

      const items: { name: string; qty: number; unitPrice: number; discount: number; productId: string | null }[] = [];
      for (const it of rawItems) {
        const name = str(it.name);
        const qty = intOf(it.qty);
        const unitPrice = num(it.unitPrice);
        if (!name) return { ok: false, error: "اسم الصنف مطلوب لكل سطر" };
        if (!Number.isFinite(qty) || qty <= 0) return { ok: false, error: `كمية غير صالحة للصنف "${name}"` };
        if (!Number.isFinite(unitPrice) || unitPrice < 0) return { ok: false, error: `سعر غير صالح للصنف "${name}"` };
        let productId = optStr(it.productId);
        if (productId) {
          const prod = await prisma.product.findFirst({ where: { id: productId, ownerId, isDeleted: false }, select: { id: true } });
          if (!prod) productId = null; // ignore a bad id rather than fail the whole sale
        }
        items.push({ name, qty, unitPrice, discount: Number.isFinite(num(it.discount)) ? Math.max(0, num(it.discount)) : 0, productId });
      }

      const currency = VALID_CURRENCIES.includes(str(args.currency).toUpperCase()) ? str(args.currency).toUpperCase() : "ILS";
      const status = str(args.status).toUpperCase() === "DRAFT" ? "DRAFT" : "ISSUED";
      const subtotal = items.reduce((s, i) => s + (i.qty * i.unitPrice - i.discount), 0);
      const discountPercent = Math.max(0, num(args.discountPercent) || 0);
      const discountAmount = discountPercent > 0 ? subtotal * (discountPercent / 100) : Math.max(0, num(args.discountAmount) || 0);
      const taxableAmount = subtotal - discountAmount;
      const taxPercent = Math.max(0, num(args.taxPercent) || 0);
      const taxAmount = taxPercent > 0 ? taxableAmount * (taxPercent / 100) : 0;
      const deliveryFee = Math.max(0, num(args.deliveryFee) || 0);
      const total = taxableAmount + taxAmount + deliveryFee;
      const paidAmount = Math.min(Math.max(0, num(args.paidAmount) || 0), total);
      const remaining = total - paidAmount;

      const summary =
        `إنشاء فاتورة ${status === "DRAFT" ? "(مسودة) " : ""}لـ "${customer.name}" — ${items.length} صنف، ` +
        `الإجمالي ${fmt(total, currency)}، المدفوع ${fmt(paidAmount, currency)}` +
        (remaining > 0 ? `، المتبقي (دين) ${fmt(remaining, currency)}` : "");

      return {
        ok: true,
        action: {
          kind: "create_invoice",
          summary,
          payload: {
            customerId, items, currency, status,
            subtotal, discountAmount, discountPercent, taxPercent, taxAmount, deliveryFee, total,
            paidAmount, remaining,
          },
        },
      };
    },
    commit: async (ownerId, userId, p) => {
      const customer = await prisma.customer.findFirst({ where: { id: p.customerId as string, ownerId, isDeleted: false }, select: { id: true } });
      if (!customer) return { error: "العميل غير موجود" };
      const items = p.items as { name: string; qty: number; unitPrice: number; discount: number; productId: string | null }[];
      const currency = p.currency as Currency;
      const status = p.status as "DRAFT" | "ISSUED";
      const paid = p.paidAmount as number;
      const total = p.total as number;
      const remaining = p.remaining as number;
      try {
        const number = await prisma.$transaction(async (tx) => {
          const invoiceNumber = await generateInvoiceNumber(tx, ownerId);
          const invoiceStatus: InvoiceStatus =
            status === "ISSUED" ? (paid >= total ? "PAID" : paid > 0 ? "PARTIAL" : "ISSUED") : "DRAFT";
          const created = await tx.invoice.create({
            data: {
              ownerId, invoiceNumber, customerId: p.customerId as string, createdById: userId,
              subtotal: p.subtotal as number,
              discountAmount: p.discountAmount as number,
              discountPercent: p.discountPercent as number,
              taxPercent: p.taxPercent as number,
              taxAmount: p.taxAmount as number,
              deliveryFee: p.deliveryFee as number,
              total, paidAmount: paid, remainingAmount: remaining,
              currency, status: invoiceStatus,
              items: {
                create: items.map((i) => ({
                  productId: i.productId, name: i.name, qty: i.qty, unitPrice: i.unitPrice,
                  discount: i.discount, total: i.qty * i.unitPrice - i.discount, source: "SALE",
                })),
              },
            },
            select: { id: true, invoiceNumber: true },
          });
          if (invoiceStatus !== "DRAFT") {
            for (const i of items) {
              if (i.productId && i.qty > 0) {
                await decrementStockOrFail(tx, i.productId, i.qty);
                await tx.stockMovement.create({
                  data: { ownerId, productId: i.productId, createdById: userId, type: "OUT", qty: i.qty, note: `فاتورة ${created.invoiceNumber}`, reference: created.invoiceNumber },
                });
              }
            }
            if (remaining > 0) {
              await tx.debt.create({
                data: { ownerId, customerId: p.customerId as string, invoiceId: created.id, amount: remaining, currency, reason: `فاتورة ${created.invoiceNumber}`, status: "PENDING" },
              });
            }
          }
          return created.invoiceNumber;
        });
        return { summary: `تم إنشاء الفاتورة ${number} بقيمة ${fmt(total, currency)}.` };
      } catch (e) {
        if (e instanceof InsufficientStockError) return { error: e.message };
        throw e;
      }
    },
  },

  // ── debts ───────────────────────────────────────────────────────────────────
  {
    name: "create_debt",
    description:
      "Record a manual customer debt (money a customer owes, not tied to a new invoice). Resolve the customer id with find_customer first. Requires amount; reason, dueDate (YYYY-MM-DD), and notes are optional.",
    parameters: {
      type: "object",
      properties: {
        customerId: { type: "string" },
        amount: { type: "string" },
        reason: { type: "string" },
        dueDate: { type: "string", description: "YYYY-MM-DD" },
        notes: { type: "string" },
      },
      required: ["customerId", "amount"],
    },
    preview: async (ownerId, args) => {
      const customerId = str(args.customerId);
      const customer = await prisma.customer.findFirst({ where: { id: customerId, ownerId, isDeleted: false }, select: { id: true, name: true } });
      if (!customer) return { ok: false, error: "العميل غير موجود" };
      const amount = num(args.amount);
      if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "المبلغ يجب أن يكون أكبر من صفر" };
      const dueDate = optStr(args.dueDate);
      return {
        ok: true,
        action: {
          kind: "create_debt",
          summary: `تسجيل دين على "${customer.name}" بقيمة ${fmt(amount)}${dueDate ? ` (استحقاق ${dueDate})` : ""}`,
          payload: { customerId, amount, reason: optStr(args.reason), dueDate, notes: optStr(args.notes) },
        },
      };
    },
    commit: async (ownerId, _userId, p) => {
      const customer = await prisma.customer.findFirst({ where: { id: p.customerId as string, ownerId, isDeleted: false }, select: { id: true } });
      if (!customer) return { error: "العميل غير موجود" };
      const dueDate = p.dueDate as string | null;
      await prisma.debt.create({
        data: {
          ownerId, customerId: p.customerId as string, amount: p.amount as number, currency: "ILS",
          reason: (p.reason as string | null) ?? null, status: "PENDING",
          dueDate: dueDate ? new Date(dueDate) : null, notes: (p.notes as string | null) ?? null,
        },
      });
      return { summary: `تم تسجيل دين بقيمة ${fmt(p.amount as number)}.` };
    },
  },

  {
    name: "record_debt_payment",
    description:
      "Record a payment toward a customer's outstanding debt. Get the debtId from get_customer_debt. Requires amount; an optional note. Overpayment is capped at the remaining balance and a linked invoice (if any) is updated automatically.",
    parameters: {
      type: "object",
      properties: {
        debtId: { type: "string" },
        amount: { type: "string" },
        note: { type: "string" },
      },
      required: ["debtId", "amount"],
    },
    preview: async (ownerId, args) => {
      const debtId = str(args.debtId);
      const debt = await prisma.debt.findFirst({
        where: { id: debtId, ownerId, isDeleted: false },
        include: { payments: { select: { amount: true } }, customer: { select: { name: true } } },
      });
      if (!debt) return { ok: false, error: "الدين غير موجود" };
      if (debt.status === "PAID") return { ok: false, error: "الدين مسدد بالكامل" };
      const amount = num(args.amount);
      if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "المبلغ يجب أن يكون أكبر من صفر" };
      const paid = debt.payments.reduce((s, p) => s + Number(p.amount), 0);
      const remaining = Number(debt.amount) - paid;
      const payment = Math.min(amount, remaining);
      const after = remaining - payment;
      return {
        ok: true,
        action: {
          kind: "record_debt_payment",
          summary: `تسجيل دفعة ${fmt(payment)} على دين "${debt.customer.name}" (المتبقي بعدها ${fmt(after)})`,
          payload: { debtId, amount, note: optStr(args.note) },
        },
      };
    },
    commit: async (ownerId, userId, p) => {
      const debtId = p.debtId as string;
      const debt = await prisma.debt.findFirst({ where: { id: debtId, ownerId, isDeleted: false }, include: { payments: true } });
      if (!debt) return { error: "الدين غير موجود" };
      if (debt.status === "PAID") return { error: "الدين مسدد بالكامل" };
      const totalPaid = debt.payments.reduce((s, x) => s + Number(x.amount), 0);
      const remaining = Number(debt.amount) - totalPaid;
      const payment = Math.min(num(p.amount), remaining);
      const newStatus = totalPaid + payment >= Number(debt.amount) ? "PAID" : "PARTIAL";
      await prisma.$transaction(async (tx) => {
        await tx.debtPayment.create({ data: { debtId, amount: payment, note: (p.note as string | null) ?? null, createdById: userId } });
        await tx.debt.update({ where: { id: debtId }, data: { status: newStatus } });
        if (debt.invoiceId) {
          const invoice = await tx.invoice.findFirst({ where: { id: debt.invoiceId } });
          if (invoice) {
            const newPaid = Number(invoice.paidAmount) + payment;
            const newRemaining = Math.max(0, Number(invoice.total) - newPaid);
            await tx.invoice.update({
              where: { id: debt.invoiceId },
              data: { paidAmount: newPaid, remainingAmount: newRemaining, status: newRemaining <= 0 ? "PAID" : "PARTIAL" },
            });
          }
        }
      });
      return { summary: `تم تسجيل دفعة ${fmt(payment)}.${newStatus === "PAID" ? " الدين الآن مسدد بالكامل." : ""}` };
    },
  },

  // ── expenses ──────────────────────────────────────────────────────────────
  {
    name: "create_expense",
    description:
      "Record a business expense. Requires amount; description, categoryName (created if new), and date (YYYY-MM-DD, default today) are optional.",
    parameters: {
      type: "object",
      properties: {
        amount: { type: "string" },
        description: { type: "string" },
        categoryName: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["amount"],
    },
    preview: async (_ownerId, args) => {
      const amount = num(args.amount);
      if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "المبلغ يجب أن يكون أكبر من صفر" };
      const description = optStr(args.description);
      const categoryName = optStr(args.categoryName);
      const date = optStr(args.date);
      return {
        ok: true,
        action: {
          kind: "create_expense",
          summary: `تسجيل مصروف بقيمة ${fmt(amount)}${categoryName ? ` — ${categoryName}` : ""}${description ? ` (${description})` : ""}`,
          payload: { amount, description, categoryName, date },
        },
      };
    },
    commit: async (ownerId, userId, p) => {
      const date = p.date as string | null;
      await prisma.$transaction(async (tx) => {
        let categoryId: string | null = null;
        const categoryName = p.categoryName as string | null;
        if (categoryName) {
          const existing = await tx.expenseCategory.findFirst({
            where: { ownerId, name: { equals: categoryName, mode: "insensitive" }, isDeleted: false },
            select: { id: true },
          });
          categoryId = existing ? existing.id : (await tx.expenseCategory.create({ data: { ownerId, name: categoryName }, select: { id: true } })).id;
        }
        await tx.expense.create({
          data: {
            ownerId, categoryId, amount: p.amount as number, currency: "ILS",
            description: (p.description as string | null) ?? null,
            date: date ? new Date(date) : new Date(), createdById: userId,
          },
        });
      });
      return { summary: `تم تسجيل مصروف بقيمة ${fmt(p.amount as number)}.` };
    },
  },

  // ── maintenance tickets ───────────────────────────────────────────────────────
  {
    name: "create_ticket",
    description:
      "Open a maintenance/repair ticket for a customer. Resolve the customer id with find_customer first. Requires deviceType (MOBILE, LAPTOP, DESKTOP, TABLET, OTHER) and problemDescription. Optional: deviceBrand, deviceModel, priority (LOW/NORMAL/HIGH/URGENT), estimatedCost, depositPaid, estimatedDelivery (YYYY-MM-DD).",
    parameters: {
      type: "object",
      properties: {
        customerId: { type: "string" },
        deviceType: { type: "string" },
        problemDescription: { type: "string" },
        deviceBrand: { type: "string" },
        deviceModel: { type: "string" },
        priority: { type: "string" },
        estimatedCost: { type: "string" },
        depositPaid: { type: "string" },
        estimatedDelivery: { type: "string" },
      },
      required: ["customerId", "deviceType", "problemDescription"],
    },
    preview: async (ownerId, args) => {
      const customerId = str(args.customerId);
      const customer = await prisma.customer.findFirst({ where: { id: customerId, ownerId, isDeleted: false }, select: { id: true, name: true } });
      if (!customer) return { ok: false, error: "العميل غير موجود" };
      const deviceType = str(args.deviceType).toUpperCase();
      if (!DEVICE_TYPES.includes(deviceType)) return { ok: false, error: `نوع الجهاز يجب أن يكون أحد: ${DEVICE_TYPES.join(", ")}` };
      const problemDescription = str(args.problemDescription);
      if (!problemDescription) return { ok: false, error: "وصف المشكلة مطلوب" };
      const priority = TICKET_PRIORITIES.includes(str(args.priority).toUpperCase()) ? str(args.priority).toUpperCase() : "NORMAL";
      const device = [str(args.deviceBrand), str(args.deviceModel)].filter(Boolean).join(" ") || deviceType;
      return {
        ok: true,
        action: {
          kind: "create_ticket",
          summary: `فتح تذكرة صيانة لـ "${customer.name}" — ${device}: ${problemDescription}`,
          payload: {
            customerId, deviceType, problemDescription, priority,
            deviceBrand: optStr(args.deviceBrand), deviceModel: optStr(args.deviceModel),
            estimatedCost: Number.isFinite(num(args.estimatedCost)) ? num(args.estimatedCost) : null,
            depositPaid: Number.isFinite(num(args.depositPaid)) ? num(args.depositPaid) : 0,
            estimatedDelivery: optStr(args.estimatedDelivery),
          },
        },
      };
    },
    commit: async (ownerId, userId, p) => {
      const customer = await prisma.customer.findFirst({ where: { id: p.customerId as string, ownerId, isDeleted: false }, select: { id: true } });
      if (!customer) return { error: "العميل غير موجود" };
      const ed = p.estimatedDelivery as string | null;
      const number = await prisma.$transaction(async (tx) => {
        const ticketNumber = await generateTicketNumber(tx, ownerId);
        await tx.maintenanceTicket.create({
          data: {
            ownerId, ticketNumber, customerId: p.customerId as string, createdById: userId,
            deviceType: p.deviceType as DeviceType,
            deviceBrand: (p.deviceBrand as string | null) ?? null,
            deviceModel: (p.deviceModel as string | null) ?? null,
            problemDescription: p.problemDescription as string,
            priority: p.priority as TicketPriority,
            estimatedCost: (p.estimatedCost as number | null) ?? null,
            depositPaid: (p.depositPaid as number) ?? 0,
            estimatedDelivery: ed ? new Date(ed) : null,
            status: "RECEIVED",
            timeline: { create: { status: "RECEIVED", note: "تم استلام الجهاز (المساعد الذكي)" } },
          },
        });
        return ticketNumber;
      });
      return { summary: `تم فتح التذكرة ${number}.` };
    },
  },

  {
    name: "update_ticket_status",
    description:
      "Move a maintenance ticket to a new status. Get the ticketId from find_ticket. Valid statuses: RECEIVED, DIAGNOSING, IN_REPAIR, WAITING_PARTS, READY, DELIVERED, CANCELLED (only legal transitions are allowed). Optional note.",
    parameters: {
      type: "object",
      properties: {
        ticketId: { type: "string" },
        status: { type: "string" },
        note: { type: "string" },
      },
      required: ["ticketId", "status"],
    },
    preview: async (ownerId, args) => {
      const ticketId = str(args.ticketId);
      const ticket = await prisma.maintenanceTicket.findFirst({
        where: { id: ticketId, ownerId, isDeleted: false },
        select: { id: true, ticketNumber: true, status: true },
      });
      if (!ticket) return { ok: false, error: "التذكرة غير موجودة" };
      const status = str(args.status).toUpperCase();
      if (!TICKET_STATUSES.includes(status)) return { ok: false, error: "حالة غير معروفة" };
      if (!TICKET_TRANSITIONS[ticket.status].includes(status)) {
        return { ok: false, error: `لا يمكن التحويل من ${TICKET_STATUS_LABELS[ticket.status]} إلى ${TICKET_STATUS_LABELS[status]}` };
      }
      return {
        ok: true,
        action: {
          kind: "update_ticket_status",
          summary: `تحديث حالة التذكرة ${ticket.ticketNumber}: ${TICKET_STATUS_LABELS[ticket.status]} ← ${TICKET_STATUS_LABELS[status]}`,
          payload: { ticketId, status, note: optStr(args.note) },
        },
      };
    },
    commit: async (ownerId, userId, p) => {
      const ticketId = p.ticketId as string;
      const status = p.status as TicketStatus;
      const ticket = await prisma.maintenanceTicket.findFirst({ where: { id: ticketId, ownerId, isDeleted: false }, select: { status: true, ticketNumber: true } });
      if (!ticket) return { error: "التذكرة غير موجودة" };
      if (!TICKET_TRANSITIONS[ticket.status].includes(status)) return { error: "تحويل الحالة غير مسموح" };
      await prisma.$transaction(async (tx) => {
        await tx.maintenanceTicket.update({
          where: { id: ticketId },
          data: { status, ...(status === "DELIVERED" ? { deliveredAt: new Date() } : {}) },
        });
        await tx.ticketUpdate.create({ data: { ticketId, status, note: (p.note as string | null) ?? null, createdById: userId } });
      });
      return { summary: `تم تحديث التذكرة ${ticket.ticketNumber} إلى ${TICKET_STATUS_LABELS[status]}.` };
    },
  },

  // ── cancel / delete ───────────────────────────────────────────────────────────
  {
    name: "cancel_invoice",
    description:
      "Cancel (void) an issued invoice. Get the invoice via get_recent_invoices or find by number first and pass its invoiceId. Restores any sold stock and voids the linked debt. Cannot cancel a draft (delete it instead).",
    parameters: {
      type: "object",
      properties: { invoiceId: { type: "string" } },
      required: ["invoiceId"],
    },
    preview: async (ownerId, args) => {
      const invoiceId = str(args.invoiceId);
      const invoice = await prisma.invoice.findFirst({
        where: { id: invoiceId, ownerId, isDeleted: false },
        select: { id: true, invoiceNumber: true, status: true, total: true, currency: true },
      });
      if (!invoice) return { ok: false, error: "الفاتورة غير موجودة" };
      if (invoice.status === "CANCELLED") return { ok: false, error: "الفاتورة ملغاة مسبقًا" };
      if (invoice.status === "DRAFT") return { ok: false, error: "هذه مسودة — احذفها بدلًا من الإلغاء" };
      return {
        ok: true,
        action: {
          kind: "cancel_invoice",
          summary: `إلغاء الفاتورة ${invoice.invoiceNumber} (${fmt(Number(invoice.total), invoice.currency)}) — سيُعاد المخزون وتُلغى الديون المرتبطة`,
          warn: "لا يمكن التراجع عن إلغاء الفاتورة.",
          payload: { invoiceId },
        },
      };
    },
    commit: async (ownerId, userId, p) => {
      const invoiceId = p.invoiceId as string;
      const invoice = await prisma.invoice.findFirst({
        where: { id: invoiceId, ownerId, isDeleted: false },
        include: { items: true },
      });
      if (!invoice) return { error: "الفاتورة غير موجودة" };
      if (invoice.status === "CANCELLED" || invoice.status === "DRAFT") return { error: "تعذّر إلغاء هذه الفاتورة" };
      await prisma.$transaction(async (tx) => {
        for (const item of invoice.items) {
          if (item.productId && item.qty > 0) {
            await tx.product.update({ where: { id: item.productId }, data: { stockQty: { increment: item.qty } } });
            await tx.stockMovement.create({
              data: { ownerId, productId: item.productId, createdById: userId, type: "IN", qty: item.qty, note: `إلغاء فاتورة ${invoice.invoiceNumber}`, reference: invoice.invoiceNumber },
            });
          }
        }
        await tx.debt.updateMany({ where: { invoiceId, isDeleted: false }, data: { isDeleted: true } });
        await tx.invoice.update({ where: { id: invoiceId }, data: { status: "CANCELLED", remainingAmount: 0 } });
      });
      return { summary: `تم إلغاء الفاتورة ${invoice.invoiceNumber}.` };
    },
  },

  {
    name: "delete_record",
    description:
      "Permanently delete a record. entity is one of: customer, supplier, product, invoice, expense, debt, ticket. This is a hard delete and cannot be undone; it will fail if other records depend on it (e.g. a customer that still has invoices). Resolve the id with the matching find_/get_ tool first.",
    parameters: {
      type: "object",
      properties: {
        entity: { type: "string", description: "customer | supplier | product | invoice | expense | debt | ticket" },
        id: { type: "string" },
      },
      required: ["entity", "id"],
    },
    preview: async (ownerId, args) => {
      const entity = str(args.entity).toLowerCase();
      const id = str(args.id);
      const labels: Record<string, string> = {
        customer: "العميل", supplier: "المورد", product: "المنتج", invoice: "الفاتورة",
        expense: "المصروف", debt: "الدين", ticket: "تذكرة الصيانة",
      };
      if (!labels[entity]) return { ok: false, error: "نوع السجل غير مدعوم للحذف" };
      let name = "";
      switch (entity) {
        case "customer": name = (await prisma.customer.findFirst({ where: { id, ownerId }, select: { name: true } }))?.name ?? ""; break;
        case "supplier": name = (await prisma.supplier.findFirst({ where: { id, ownerId }, select: { name: true } }))?.name ?? ""; break;
        case "product": name = (await prisma.product.findFirst({ where: { id, ownerId }, select: { name: true } }))?.name ?? ""; break;
        case "invoice": name = (await prisma.invoice.findFirst({ where: { id, ownerId }, select: { invoiceNumber: true } }))?.invoiceNumber ?? ""; break;
        case "expense": { const e = await prisma.expense.findFirst({ where: { id, ownerId }, select: { amount: true, description: true } }); name = e ? (e.description ?? fmt(Number(e.amount))) : ""; break; }
        case "debt": { const d = await prisma.debt.findFirst({ where: { id, ownerId }, select: { amount: true, customer: { select: { name: true } } } }); name = d ? `${d.customer.name} — ${fmt(Number(d.amount))}` : ""; break; }
        case "ticket": name = (await prisma.maintenanceTicket.findFirst({ where: { id, ownerId }, select: { ticketNumber: true } }))?.ticketNumber ?? ""; break;
      }
      if (!name) return { ok: false, error: `${labels[entity]} غير موجود` };
      return {
        ok: true,
        action: {
          kind: "delete_record",
          summary: `حذف نهائي لـ${labels[entity]}: ${name}`,
          warn: "حذف نهائي لا يمكن التراجع عنه.",
          payload: { entity, id },
        },
      };
    },
    commit: async (ownerId, _userId, p) => {
      const entity = p.entity as string;
      const id = p.id as string;
      try {
        let count = 0;
        switch (entity) {
          case "customer": count = (await prisma.customer.deleteMany({ where: { id, ownerId } })).count; break;
          case "supplier": count = (await prisma.supplier.deleteMany({ where: { id, ownerId } })).count; break;
          case "product": count = (await prisma.product.deleteMany({ where: { id, ownerId } })).count; break;
          case "invoice": count = (await prisma.invoice.deleteMany({ where: { id, ownerId } })).count; break;
          case "expense": count = (await prisma.expense.deleteMany({ where: { id, ownerId } })).count; break;
          case "debt": count = (await prisma.debt.deleteMany({ where: { id, ownerId } })).count; break;
          case "ticket": count = (await prisma.maintenanceTicket.deleteMany({ where: { id, ownerId } })).count; break;
          default: return { error: "نوع السجل غير مدعوم" };
        }
        if (count === 0) return { error: "السجل غير موجود" };
        return { summary: "تم الحذف نهائيًا." };
      } catch {
        return { error: "تعذّر الحذف نهائيًا — قد توجد سجلات مرتبطة بهذا السجل. جرّب الإلغاء بدلًا من الحذف." };
      }
    },
  },
];

const ACTION_INDEX = new Map(ACTIONS.map((a) => [a.name, a]));

export function getActionToolSchemas() {
  return ACTIONS.map((a) => ({
    type: "function" as const,
    function: { name: a.name, description: a.description, parameters: a.parameters },
  }));
}

export function isActionTool(name: string): boolean {
  return ACTION_INDEX.has(name);
}

export async function previewAction(
  name: string,
  ownerId: string,
  args: Record<string, unknown>
): Promise<PreviewResult> {
  const tool = ACTION_INDEX.get(name);
  if (!tool) return { ok: false, error: `unknown_action:${name}` };
  try {
    return await tool.preview(ownerId, args);
  } catch (e) {
    console.error(`preview ${name} failed:`, e);
    return { ok: false, error: "تعذّر تجهيز العملية" };
  }
}

export async function commitAction(
  ownerId: string,
  userId: string,
  action: StagedAction
): Promise<CommitResult> {
  const tool = ACTION_INDEX.get(action.kind);
  if (!tool) return { error: "عملية غير معروفة" };
  try {
    return await tool.commit(ownerId, userId, action.payload);
  } catch (e) {
    console.error(`commit ${action.kind} failed:`, e);
    return { error: "فشل تنفيذ العملية" };
  }
}
