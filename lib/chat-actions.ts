import { prisma } from "./prisma";
import { decrementStockOrFail, issueStockFromInventory, returnStockToInventory, InsufficientStockError } from "./stock";
import { generateInvoiceNumber, generateTicketNumber } from "./invoice-number";
import { softDeleteInvoice } from "./services/invoices";
import { softDeleteTicket } from "./services/tickets";
import { softDeleteDebt } from "./services/debts";
import { softDeletePayable } from "./services/payables";
import { invalidateUserCache } from "./auth";
import { createAdminClient } from "./supabase/admin";
import type {
  Currency,
  DeviceType,
  TicketStatus,
  TicketPriority,
  InvoiceStatus,
  UserRole,
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
  // Mirrors the REST API's requireAdmin/withAdmin-gated endpoints (expenses,
  // employees) — filtered out of the schema list for STAFF and re-checked at
  // preview/commit time so a crafted request can't bypass it either.
  adminOnly?: boolean;
  preview: (ownerId: string, args: Record<string, unknown>) => Promise<PreviewResult>;
  commit: (ownerId: string, userId: string, payload: Record<string, unknown>) => Promise<CommitResult>;
}

// ── helpers ───────────────────────────────────────────────────────────────────

const CURRENCY_SYMBOLS: Record<string, string> = { ILS: "₪", USD: "$", JOD: "JD" };
const VALID_CURRENCIES = ["ILS", "USD", "JOD"];
const DEVICE_TYPES = ["MOBILE", "LAPTOP", "DESKTOP", "TABLET", "OTHER"];
const TICKET_STATUSES = [
  "RECEIVED", "DIAGNOSING", "IN_REPAIR", "WAITING_PARTS", "READY", "DELIVERED", "CANCELLED", "UNREPAIRABLE",
];
const TICKET_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"];

const TICKET_STATUS_LABELS: Record<string, string> = {
  RECEIVED: "مستلم", DIAGNOSING: "تشخيص", IN_REPAIR: "قيد الإصلاح",
  WAITING_PARTS: "انتظار قطع", READY: "جاهز", DELIVERED: "مُسلَّم", CANCELLED: "ملغي",
  UNREPAIRABLE: "لا يمكن إصلاحه",
};

const TICKET_TRANSITIONS: Record<string, string[]> = {
  RECEIVED: ["DIAGNOSING", "CANCELLED", "UNREPAIRABLE"],
  DIAGNOSING: ["IN_REPAIR", "WAITING_PARTS", "READY", "CANCELLED", "UNREPAIRABLE"],
  IN_REPAIR: ["WAITING_PARTS", "READY", "CANCELLED", "UNREPAIRABLE"],
  WAITING_PARTS: ["IN_REPAIR", "READY", "CANCELLED", "UNREPAIRABLE"],
  READY: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
  UNREPAIRABLE: [],
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

  {
    name: "update_supplier",
    description: "Update an existing supplier's details. Resolve the supplier id first with find_supplier. Provide only the fields to change.",
    parameters: {
      type: "object",
      properties: {
        supplierId: { type: "string" },
        name: { type: "string" },
        phone: { type: "string" },
        company: { type: "string" },
        notes: { type: "string" },
      },
      required: ["supplierId"],
    },
    preview: async (ownerId, args) => {
      const supplierId = str(args.supplierId);
      const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, ownerId, isDeleted: false }, select: { id: true, name: true } });
      if (!supplier) return { ok: false, error: "المورد غير موجود" };
      const patch: Record<string, string | null> = {};
      if (args.name !== undefined) patch.name = str(args.name) || supplier.name;
      if (args.phone !== undefined) patch.phone = optStr(args.phone);
      if (args.company !== undefined) patch.company = optStr(args.company);
      if (args.notes !== undefined) patch.notes = optStr(args.notes);
      if (Object.keys(patch).length === 0) return { ok: false, error: "لا توجد حقول للتعديل" };
      if (patch.phone) {
        const dup = await prisma.supplier.findFirst({ where: { ownerId, phone: patch.phone, isDeleted: false, NOT: { id: supplierId } }, select: { id: true } });
        if (dup) return { ok: false, error: `يوجد مورد آخر برقم الهاتف ${patch.phone}` };
      }
      const parts = Object.entries(patch).map(([k, v]) => `${k}: ${v ?? "—"}`);
      return {
        ok: true,
        action: { kind: "update_supplier", summary: `تعديل المورد "${supplier.name}" (${parts.join("، ")})`, payload: { supplierId, patch } },
      };
    },
    commit: async (ownerId, _userId, p) => {
      const supplierId = p.supplierId as string;
      const res = await prisma.supplier.updateMany({
        where: { id: supplierId, ownerId, isDeleted: false },
        data: p.patch as Record<string, string | null>,
      });
      if (res.count === 0) return { error: "المورد غير موجود" };
      return { summary: "تم تعديل بيانات المورد." };
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

  // ── categories ─────────────────────────────────────────────────────────────
  {
    name: "create_category",
    description: "Create a new inventory/product category.",
    parameters: {
      type: "object",
      properties: { name: { type: "string" }, icon: { type: "string" } },
      required: ["name"],
    },
    preview: async (ownerId, args) => {
      const name = str(args.name);
      if (!name) return { ok: false, error: "اسم الفئة مطلوب" };
      const existing = await prisma.category.findFirst({ where: { ownerId, name: { equals: name, mode: "insensitive" }, isDeleted: false }, select: { id: true } });
      if (existing) return { ok: false, error: `فئة بنفس الاسم موجودة مسبقًا: ${name}` };
      return {
        ok: true,
        action: { kind: "create_category", summary: `إضافة فئة جديدة: ${name}`, payload: { name, icon: optStr(args.icon) } },
      };
    },
    commit: async (ownerId, _userId, p) => {
      const name = p.name as string;
      const existing = await prisma.category.findFirst({ where: { ownerId, name: { equals: name, mode: "insensitive" }, isDeleted: false }, select: { id: true } });
      if (existing) return { error: `فئة بنفس الاسم موجودة مسبقًا: ${name}` };
      const slug = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9؀-ۿ-]/g, "").slice(0, 50) + "-" + Date.now();
      await prisma.category.create({ data: { ownerId, name, slug, icon: p.icon as string | null } });
      return { summary: `تمت إضافة فئة "${name}".` };
    },
  },

  {
    name: "update_category",
    description: "Rename a category or change its icon. Resolve the category first via get_low_stock_products or the product list if unsure of its id.",
    parameters: {
      type: "object",
      properties: { categoryId: { type: "string" }, name: { type: "string" }, icon: { type: "string" } },
      required: ["categoryId"],
    },
    preview: async (ownerId, args) => {
      const categoryId = str(args.categoryId);
      const category = await prisma.category.findFirst({ where: { id: categoryId, ownerId, isDeleted: false }, select: { name: true } });
      if (!category) return { ok: false, error: "الفئة غير موجودة" };
      const patch: Record<string, string> = {};
      if (args.name !== undefined) patch.name = str(args.name) || category.name;
      if (args.icon !== undefined) patch.icon = str(args.icon);
      if (Object.keys(patch).length === 0) return { ok: false, error: "لا توجد حقول للتعديل" };
      return {
        ok: true,
        action: { kind: "update_category", summary: `تعديل الفئة "${category.name}"`, payload: { categoryId, patch } },
      };
    },
    commit: async (ownerId, _userId, p) => {
      const categoryId = p.categoryId as string;
      const res = await prisma.category.updateMany({ where: { id: categoryId, ownerId, isDeleted: false }, data: p.patch as Record<string, string> });
      if (res.count === 0) return { error: "الفئة غير موجودة" };
      return { summary: "تم تعديل الفئة." };
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
            if (paid > 0) {
              await tx.invoicePayment.create({
                data: { invoiceId: created.id, amount: paid, note: "دفعة عند إصدار الفاتورة", createdById: userId },
              });
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

  {
    name: "issue_invoice",
    description: "Finalize a DRAFT invoice: issues it (decrements stock, opens a debt for any remaining balance). Get the invoiceId from get_recent_invoices or find results. Only works on DRAFT invoices.",
    parameters: {
      type: "object",
      properties: { invoiceId: { type: "string" } },
      required: ["invoiceId"],
    },
    preview: async (ownerId, args) => {
      const invoiceId = str(args.invoiceId);
      const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, ownerId, isDeleted: false } });
      if (!invoice) return { ok: false, error: "الفاتورة غير موجودة" };
      if (invoice.status !== "DRAFT") return { ok: false, error: "هذه الفاتورة ليست مسودة" };
      return {
        ok: true,
        action: {
          kind: "issue_invoice",
          summary: `إصدار الفاتورة ${invoice.invoiceNumber} (${fmt(Number(invoice.total), invoice.currency)}) — سيُخصم المخزون ويُفتح دين بالمتبقي إن وجد`,
          payload: { invoiceId },
        },
      };
    },
    commit: async (ownerId, userId, p) => {
      const invoiceId = p.invoiceId as string;
      const invoice = await prisma.invoice.findFirst({
        where: { id: invoiceId, ownerId, isDeleted: false },
        include: { items: true, debts: { where: { isDeleted: false } } },
      });
      if (!invoice) return { error: "الفاتورة غير موجودة" };
      if (invoice.status !== "DRAFT") return { error: "هذه الفاتورة ليست مسودة" };
      await prisma.$transaction(async (tx) => {
        for (const item of invoice.items) {
          if (item.productId && item.qty > 0) {
            await issueStockFromInventory(tx, {
              ownerId, userId, productId: item.productId, qty: item.qty,
              note: `فاتورة ${invoice.invoiceNumber}`, reference: invoice.invoiceNumber,
            });
          }
        }
        const remaining = Number(invoice.remainingAmount);
        if (remaining > 0 && invoice.debts.length === 0) {
          await tx.debt.create({
            data: {
              ownerId, customerId: invoice.customerId, invoiceId: invoice.id, amount: remaining,
              currency: invoice.currency, reason: `فاتورة ${invoice.invoiceNumber}`, status: "PENDING",
            },
          });
        }
        if (invoice.ticketId) {
          await tx.maintenanceTicket.update({
            where: { id: invoice.ticketId },
            data: { status: "DELIVERED", deliveredAt: new Date() },
          });
          await tx.ticketUpdate.create({
            data: { ticketId: invoice.ticketId, status: "DELIVERED", note: `تم التسليم وإصدار الفاتورة ${invoice.invoiceNumber}`, createdById: userId },
          });
        }
        const newStatus = remaining <= 0 ? "PAID" : Number(invoice.paidAmount) > 0 ? "PARTIAL" : "ISSUED";
        await tx.invoice.update({ where: { id: invoiceId }, data: { status: newStatus } });
      });
      return { summary: `تم إصدار الفاتورة ${invoice.invoiceNumber}.` };
    },
  },

  {
    name: "record_invoice_payment",
    description: "Record a payment directly against an invoice (works whether or not it has a linked debt/installment). Get the invoiceId from get_recent_invoices or find results.",
    parameters: {
      type: "object",
      properties: {
        invoiceId: { type: "string" },
        amount: { type: "string" },
        note: { type: "string" },
      },
      required: ["invoiceId", "amount"],
    },
    preview: async (ownerId, args) => {
      const invoiceId = str(args.invoiceId);
      const amount = num(args.amount);
      if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "المبلغ يجب أن يكون أكبر من صفر" };
      const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, ownerId, isDeleted: false } });
      if (!invoice) return { ok: false, error: "الفاتورة غير موجودة" };
      if (invoice.status === "PAID") return { ok: false, error: "الفاتورة مدفوعة بالكامل" };
      if (invoice.status === "DRAFT" || invoice.status === "CANCELLED") return { ok: false, error: "لا يمكن إضافة دفعة لهذه الفاتورة" };
      return {
        ok: true,
        action: {
          kind: "record_invoice_payment",
          summary: `تسجيل دفعة ${fmt(amount, invoice.currency)} على الفاتورة ${invoice.invoiceNumber}`,
          payload: { invoiceId, amount, note: optStr(args.note) },
        },
      };
    },
    commit: async (ownerId, userId, p) => {
      const invoiceId = p.invoiceId as string;
      const amount = p.amount as number;
      const note = p.note as string | null;
      const invoice = await prisma.invoice.findFirst({
        where: { id: invoiceId, ownerId, isDeleted: false },
        include: { debts: { where: { isDeleted: false }, include: { payments: true } } },
      });
      if (!invoice) return { error: "الفاتورة غير موجودة" };
      if (invoice.status === "PAID") return { error: "الفاتورة مدفوعة بالكامل" };
      if (invoice.status === "DRAFT" || invoice.status === "CANCELLED") return { error: "لا يمكن إضافة دفعة لهذه الفاتورة" };

      const remaining = Number(invoice.remainingAmount);
      const payment = Math.min(amount, remaining);
      const newPaid = Number(invoice.paidAmount) + payment;
      const newRemaining = Number(invoice.total) - newPaid;
      const newStatus = newRemaining <= 0 ? "PAID" : "PARTIAL";

      await prisma.$transaction(async (tx) => {
        await tx.invoice.update({
          where: { id: invoiceId },
          data: { paidAmount: newPaid, remainingAmount: Math.max(0, newRemaining), status: newStatus },
        });
        const ordered = invoice.debts.slice().sort((a, b) => {
          const da = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
          const db = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
          if (da !== db) return da - db;
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        });
        let leftover = payment;
        for (const debt of ordered) {
          if (leftover <= 0.0001) break;
          const debtPaid = debt.payments.reduce((s, x) => s + Number(x.amount), 0);
          const debtRemaining = Number(debt.amount) - debtPaid;
          if (debtRemaining <= 0) continue;
          const apply = Math.min(debtRemaining, leftover);
          const debtStatus = debtPaid + apply >= Number(debt.amount) ? "PAID" : "PARTIAL";
          await tx.debtPayment.create({ data: { debtId: debt.id, amount: apply, note, createdById: userId } });
          await tx.debt.update({ where: { id: debt.id }, data: { status: debtStatus } });
          leftover -= apply;
        }
        await tx.invoicePayment.create({ data: { invoiceId, amount: payment, note, createdById: userId } });
      });
      return { summary: `تم تسجيل دفعة ${fmt(payment, invoice.currency)} على الفاتورة ${invoice.invoiceNumber}.` };
    },
  },

  // ── purchases (supplier invoices) ─────────────────────────────────────────────
  {
    name: "create_purchase_invoice",
    description:
      "Record a SUPPLIER PURCHASE invoice — goods the shop BOUGHT from a vendor. For each item it creates the product (or restocks it if the SKU already exists) and logs an IN stock movement, then opens a payable (money the shop now owes the supplier). Use THIS, not create_invoice, whenever the user gives a purchase/buying invoice from a supplier or says to add goods/stock from an invoice. items is an array of { name, qty, unitCost, sku? } where unitCost is what the shop paid per single piece. supplierName, supplierPhone, supplierCompany, invoiceNumber, invoiceDate (YYYY-MM-DD) and currency (ILS default) are optional.",
    parameters: {
      type: "object",
      properties: {
        supplierName: { type: "string", description: "Supplier/vendor name (optional)." },
        supplierPhone: { type: "string", description: "Supplier phone — used to match an existing supplier." },
        supplierCompany: { type: "string" },
        items: {
          type: "array",
          description: "Purchased line items.",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              qty: { type: "string", description: "Quantity bought (positive integer)." },
              unitCost: { type: "string", description: "Cost the shop paid per single piece." },
              sku: { type: "string", description: "SKU/code to match an existing product (optional)." },
            },
            required: ["name", "qty", "unitCost"],
          },
        },
        invoiceNumber: { type: "string" },
        invoiceDate: { type: "string", description: "YYYY-MM-DD" },
        currency: { type: "string", description: "ILS | USD | JOD (default ILS)." },
      },
      required: ["items"],
    },
    preview: async (_ownerId, args) => {
      const rawItems = Array.isArray(args.items) ? (args.items as Record<string, unknown>[]) : [];
      if (rawItems.length === 0) return { ok: false, error: "يجب إضافة صنف واحد على الأقل" };
      const items: { name: string; qty: number; unitCost: number; sku: string | null }[] = [];
      for (const it of rawItems) {
        const name = str(it.name);
        const qty = intOf(it.qty);
        const unitCost = num(it.unitCost);
        if (!name) return { ok: false, error: "اسم الصنف مطلوب لكل سطر" };
        if (!Number.isFinite(qty) || qty <= 0) return { ok: false, error: `كمية غير صالحة للصنف "${name}"` };
        if (!Number.isFinite(unitCost) || unitCost < 0) return { ok: false, error: `تكلفة غير صالحة للصنف "${name}"` };
        items.push({ name, qty, unitCost, sku: optStr(it.sku) });
      }
      const currency = VALID_CURRENCIES.includes(str(args.currency).toUpperCase()) ? str(args.currency).toUpperCase() : "ILS";
      const payableTotal = items.reduce((s, i) => s + i.qty * i.unitCost, 0);
      const supplierName = optStr(args.supplierName);
      const preview = items.slice(0, 3).map((i) => `• ${i.name} — ${i.qty} × ${fmt(i.unitCost, currency)}`);
      if (items.length > 3) preview.push(`• … و${items.length - 3} صنف آخر`);
      return {
        ok: true,
        action: {
          kind: "create_purchase_invoice",
          summary:
            `إدخال فاتورة شراء من المورد "${supplierName ?? "غير معروف"}" — ${items.length} صنف، ` +
            `الإجمالي ${fmt(payableTotal, currency)}. ستُضاف الأصناف للمخزون وتُفتح فاتورة مستحقة للمورد بهذه القيمة.\n` +
            preview.join("\n"),
          payload: {
            supplier: { name: supplierName, phone: optStr(args.supplierPhone), company: optStr(args.supplierCompany) },
            items,
            invoiceNumber: optStr(args.invoiceNumber),
            invoiceDate: optStr(args.invoiceDate),
            currency,
            payableTotal,
          },
        },
      };
    },
    commit: async (ownerId, userId, p) => {
      const supplier = p.supplier as { name: string | null; phone: string | null; company: string | null };
      const items = p.items as { name: string; qty: number; unitCost: number; sku: string | null }[];
      if (items.length === 0) return { error: "لا توجد أصناف للإدخال" };
      const currency = p.currency as Currency;
      const invoiceNumber = (p.invoiceNumber as string | null) ?? null;
      const invoiceDate = (p.invoiceDate as string | null) ?? null;
      const reference = invoiceNumber ? `استيراد ${invoiceNumber}` : "فاتورة شراء (المساعد الذكي)";
      const noteBase = invoiceDate ? `${reference} (${invoiceDate})` : reference;

      const result = await prisma.$transaction(
        async (tx) => {
          // Supplier — match by phone within the shop, else create.
          let supplierId: string | null = null;
          const phone = supplier.phone?.trim() || null;
          if (phone) {
            const found = await tx.supplier.findFirst({ where: { ownerId, phone, isDeleted: false }, select: { id: true } });
            if (found) supplierId = found.id;
          }
          if (!supplierId) {
            const made = await tx.supplier.create({
              data: { ownerId, name: supplier.name ?? "مورد غير معروف", phone, company: supplier.company },
              select: { id: true },
            });
            supplierId = made.id;
          }

          let created = 0;
          let restocked = 0;
          let payableTotal = 0;
          for (const item of items) {
            let productId: string | null = null;
            if (item.sku) {
              const found = await tx.product.findFirst({ where: { ownerId, sku: item.sku, isDeleted: false }, select: { id: true } });
              if (found) productId = found.id;
            }
            if (!productId) {
              const made = await tx.product.create({
                data: { ownerId, name: item.name, sku: item.sku, costPrice: item.unitCost, sellPrice: item.unitCost, stockQty: item.qty, supplierId },
                select: { id: true },
              });
              productId = made.id;
              created++;
            } else {
              await tx.product.update({ where: { id: productId }, data: { stockQty: { increment: item.qty }, costPrice: item.unitCost } });
              restocked++;
            }
            await tx.stockMovement.create({
              data: { ownerId, productId, createdById: userId, type: "IN", qty: item.qty, note: noteBase, reference: invoiceNumber ?? undefined },
            });
            payableTotal += item.qty * item.unitCost;
          }

          await tx.payable.create({
            data: { ownerId, supplierId, amount: payableTotal, currency, reason: noteBase, status: "PENDING" },
          });
          return { created, restocked, payableTotal };
        },
        { timeout: 60_000, maxWait: 10_000 }
      );

      return {
        summary: `تمت إضافة ${result.created} منتج جديد، وتجديد مخزون ${result.restocked} منتج، وفتح فاتورة مستحقة للمورد بقيمة ${fmt(result.payableTotal, currency)}.`,
      };
    },
  },

  // ── payables (money owed to suppliers) ───────────────────────────────────────
  {
    name: "create_payable",
    description: "Record a manual amount owed to a supplier (not tied to a purchase invoice). Resolve supplierId via find_supplier first.",
    parameters: {
      type: "object",
      properties: {
        supplierId: { type: "string" },
        amount: { type: "string" },
        currency: { type: "string", description: "ILS | USD | JOD, default ILS" },
        reason: { type: "string" },
        dueDate: { type: "string", description: "YYYY-MM-DD" },
        notes: { type: "string" },
      },
      required: ["supplierId", "amount"],
    },
    preview: async (ownerId, args) => {
      const supplierId = str(args.supplierId);
      const amount = num(args.amount);
      if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "المبلغ يجب أن يكون أكبر من صفر" };
      const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, ownerId, isDeleted: false }, select: { name: true } });
      if (!supplier) return { ok: false, error: "المورد غير موجود" };
      const currency = str(args.currency).toUpperCase() || "ILS";
      if (!VALID_CURRENCIES.includes(currency)) return { ok: false, error: "عملة غير معروفة" };
      return {
        ok: true,
        action: {
          kind: "create_payable",
          summary: `إضافة مستحق للمورد "${supplier.name}" بقيمة ${fmt(amount, currency)}`,
          payload: { supplierId, amount, currency, reason: optStr(args.reason), dueDate: optStr(args.dueDate), notes: optStr(args.notes) },
        },
      };
    },
    commit: async (ownerId, _userId, p) => {
      const supplier = await prisma.supplier.findFirst({ where: { id: p.supplierId as string, ownerId, isDeleted: false }, select: { name: true } });
      if (!supplier) return { error: "المورد غير موجود" };
      await prisma.payable.create({
        data: {
          ownerId, supplierId: p.supplierId as string, amount: p.amount as number,
          currency: p.currency as Currency, reason: (p.reason as string | null) ?? null,
          dueDate: p.dueDate ? new Date(p.dueDate as string) : null,
          notes: (p.notes as string | null) ?? null, status: "PENDING",
        },
      });
      return { summary: `تمت إضافة مستحق للمورد "${supplier.name}".` };
    },
  },

  {
    name: "update_payable",
    description: "Edit a payable's reason, due date, notes, amount, or currency.",
    parameters: {
      type: "object",
      properties: {
        payableId: { type: "string" },
        amount: { type: "string" },
        currency: { type: "string" },
        reason: { type: "string" },
        dueDate: { type: "string", description: "YYYY-MM-DD" },
        notes: { type: "string" },
      },
      required: ["payableId"],
    },
    preview: async (ownerId, args) => {
      const payableId = str(args.payableId);
      const payable = await prisma.payable.findFirst({
        where: { id: payableId, ownerId, isDeleted: false },
        include: { supplier: { select: { name: true } }, payments: { select: { amount: true } } },
      });
      if (!payable) return { ok: false, error: "المستحق غير موجود" };
      const patch: Record<string, unknown> = {};
      if (args.reason !== undefined) patch.reason = optStr(args.reason);
      if (args.dueDate !== undefined) patch.dueDate = optStr(args.dueDate);
      if (args.notes !== undefined) patch.notes = optStr(args.notes);
      if (args.currency !== undefined) patch.currency = str(args.currency).toUpperCase();
      if (args.amount !== undefined) {
        const amt = num(args.amount);
        if (!Number.isFinite(amt) || amt <= 0) return { ok: false, error: "المبلغ يجب أن يكون أكبر من صفر" };
        const totalPaid = payable.payments.reduce((s, x) => s + Number(x.amount), 0);
        if (amt < totalPaid) return { ok: false, error: `المبلغ الجديد أقل من المسدّد (${fmt(totalPaid)})` };
        patch.amount = amt;
      }
      if (Object.keys(patch).length === 0) return { ok: false, error: "لا توجد حقول للتعديل" };
      return {
        ok: true,
        action: { kind: "update_payable", summary: `تعديل مستحق المورد "${payable.supplier.name}"`, payload: { payableId, patch } },
      };
    },
    commit: async (ownerId, _userId, p) => {
      const payableId = p.payableId as string;
      const patch = p.patch as Record<string, unknown>;
      const payable = await prisma.payable.findFirst({ where: { id: payableId, ownerId, isDeleted: false }, include: { payments: true } });
      if (!payable) return { error: "المستحق غير موجود" };
      const data: Record<string, unknown> = {};
      if (patch.reason !== undefined) data.reason = patch.reason;
      if (patch.notes !== undefined) data.notes = patch.notes;
      if (patch.currency !== undefined) data.currency = patch.currency;
      if (patch.dueDate !== undefined) data.dueDate = patch.dueDate ? new Date(patch.dueDate as string) : null;
      if (patch.amount !== undefined) {
        const amt = patch.amount as number;
        const totalPaid = payable.payments.reduce((s, x) => s + Number(x.amount), 0);
        data.amount = amt;
        data.status = totalPaid >= amt ? "PAID" : totalPaid > 0 ? "PARTIAL" : "PENDING";
      }
      await prisma.payable.update({ where: { id: payableId }, data });
      return { summary: "تم تعديل المستحق." };
    },
  },

  {
    name: "record_payable_payment",
    description: "Record a payment made to a supplier against one of their payables. Resolve payableId via get_outstanding_payables first.",
    parameters: {
      type: "object",
      properties: { payableId: { type: "string" }, amount: { type: "string" }, note: { type: "string" } },
      required: ["payableId", "amount"],
    },
    preview: async (ownerId, args) => {
      const payableId = str(args.payableId);
      const amount = num(args.amount);
      if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "المبلغ يجب أن يكون أكبر من صفر" };
      const payable = await prisma.payable.findFirst({
        where: { id: payableId, ownerId, isDeleted: false },
        include: { supplier: { select: { name: true } }, payments: true },
      });
      if (!payable) return { ok: false, error: "المستحق غير موجود" };
      if (payable.status === "PAID") return { ok: false, error: "المستحق مسدد بالكامل" };
      return {
        ok: true,
        action: {
          kind: "record_payable_payment",
          summary: `تسجيل دفعة ${fmt(amount, payable.currency)} للمورد "${payable.supplier.name}"`,
          payload: { payableId, amount, note: optStr(args.note) },
        },
      };
    },
    commit: async (ownerId, userId, p) => {
      const payableId = p.payableId as string;
      const amount = p.amount as number;
      const payable = await prisma.payable.findFirst({ where: { id: payableId, ownerId, isDeleted: false }, include: { payments: true } });
      if (!payable) return { error: "المستحق غير موجود" };
      if (payable.status === "PAID") return { error: "المستحق مسدد بالكامل" };
      const totalPaid = payable.payments.reduce((s, x) => s + Number(x.amount), 0);
      const remaining = Number(payable.amount) - totalPaid;
      const payment = Math.min(amount, remaining);
      const newStatus = totalPaid + payment >= Number(payable.amount) ? "PAID" : "PARTIAL";
      await prisma.$transaction(async (tx) => {
        await tx.payablePayment.create({ data: { payableId, amount: payment, note: (p.note as string | null) ?? null, createdById: userId } });
        await tx.payable.update({ where: { id: payableId }, data: { status: newStatus } });
      });
      return { summary: `تم تسجيل دفعة ${fmt(payment)}.${newStatus === "PAID" ? " المستحق الآن مسدد بالكامل." : ""}` };
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
            // Mirrors the invoice's own payment log (see InvoicePayment) so a
            // debt paid from the chat assistant shows up in the invoice's
            // "سجل الدفعات" history the same as one paid from the debts page.
            await tx.invoicePayment.create({
              data: { invoiceId: debt.invoiceId, amount: payment, note: (p.note as string | null) ?? null, createdById: userId },
            });
          }
        }
      });
      return { summary: `تم تسجيل دفعة ${fmt(payment)}.${newStatus === "PAID" ? " الدين الآن مسدد بالكامل." : ""}` };
    },
  },

  {
    name: "update_debt",
    description: "Edit a manual (standalone) customer debt's reason, due date, notes, amount, or currency. A debt backed by an invoice can only have its reason/dueDate/notes edited — its amount/currency are read-only (edit the invoice instead).",
    parameters: {
      type: "object",
      properties: {
        debtId: { type: "string" },
        amount: { type: "string" },
        currency: { type: "string" },
        reason: { type: "string" },
        dueDate: { type: "string", description: "YYYY-MM-DD" },
        notes: { type: "string" },
      },
      required: ["debtId"],
    },
    preview: async (ownerId, args) => {
      const debtId = str(args.debtId);
      const debt = await prisma.debt.findFirst({
        where: { id: debtId, ownerId, isDeleted: false },
        include: { customer: { select: { name: true } }, payments: { select: { amount: true } }, invoice: { select: { invoiceNumber: true } } },
      });
      if (!debt) return { ok: false, error: "الدين غير موجود" };
      const isLinked = !!debt.invoiceId;
      const patch: Record<string, unknown> = {};
      if (args.reason !== undefined) patch.reason = optStr(args.reason);
      if (args.dueDate !== undefined) patch.dueDate = optStr(args.dueDate);
      if (args.notes !== undefined) patch.notes = optStr(args.notes);
      if (args.amount !== undefined || args.currency !== undefined) {
        if (isLinked) return { ok: false, error: `هذا الدين مرتبط بالفاتورة ${debt.invoice!.invoiceNumber} — عدّل المبلغ من الفاتورة بدلًا من ذلك` };
        if (args.currency !== undefined) patch.currency = str(args.currency).toUpperCase();
        if (args.amount !== undefined) {
          const amt = num(args.amount);
          if (!Number.isFinite(amt) || amt <= 0) return { ok: false, error: "المبلغ يجب أن يكون أكبر من صفر" };
          const totalPaid = debt.payments.reduce((s, x) => s + Number(x.amount), 0);
          if (amt < totalPaid) return { ok: false, error: `المبلغ الجديد أقل من المسدّد (${fmt(totalPaid)})` };
          patch.amount = amt;
        }
      }
      if (Object.keys(patch).length === 0) return { ok: false, error: "لا توجد حقول للتعديل" };
      return {
        ok: true,
        action: { kind: "update_debt", summary: `تعديل دين العميل "${debt.customer.name}"`, payload: { debtId, patch } },
      };
    },
    commit: async (ownerId, _userId, p) => {
      const debtId = p.debtId as string;
      const patch = p.patch as Record<string, unknown>;
      const debt = await prisma.debt.findFirst({ where: { id: debtId, ownerId, isDeleted: false }, include: { payments: true } });
      if (!debt) return { error: "الدين غير موجود" };
      const data: Record<string, unknown> = {};
      if (patch.reason !== undefined) data.reason = patch.reason;
      if (patch.notes !== undefined) data.notes = patch.notes;
      if (patch.dueDate !== undefined) data.dueDate = patch.dueDate ? new Date(patch.dueDate as string) : null;
      if (patch.currency !== undefined) {
        if (debt.invoiceId) return { error: "لا يمكن تعديل عملة دين مرتبط بفاتورة" };
        data.currency = patch.currency;
      }
      if (patch.amount !== undefined) {
        if (debt.invoiceId) return { error: "لا يمكن تعديل مبلغ دين مرتبط بفاتورة" };
        const amt = patch.amount as number;
        const totalPaid = debt.payments.reduce((s, x) => s + Number(x.amount), 0);
        data.amount = amt;
        data.status = totalPaid >= amt ? "PAID" : totalPaid > 0 ? "PARTIAL" : "PENDING";
      }
      await prisma.debt.update({ where: { id: debtId }, data });
      return { summary: "تم تعديل الدين." };
    },
  },

  // ── expenses ──────────────────────────────────────────────────────────────
  {
    name: "create_expense",
    description:
      "Record a business expense. Requires amount; description, categoryName (created if new), and date (YYYY-MM-DD, default today) are optional. Admin only.",
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
    adminOnly: true,
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

  {
    name: "update_expense",
    description: "Edit an existing expense's amount, category, description, or date. Admin only.",
    parameters: {
      type: "object",
      properties: {
        expenseId: { type: "string" },
        amount: { type: "string" },
        categoryName: { type: "string" },
        description: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["expenseId"],
    },
    adminOnly: true,
    preview: async (ownerId, args) => {
      const expenseId = str(args.expenseId);
      const expense = await prisma.expense.findFirst({ where: { id: expenseId, ownerId, isDeleted: false }, select: { amount: true, description: true } });
      if (!expense) return { ok: false, error: "المصروف غير موجود" };
      const patch: Record<string, unknown> = {};
      if (args.description !== undefined) patch.description = optStr(args.description);
      if (args.date !== undefined) patch.date = optStr(args.date);
      if (args.categoryName !== undefined) patch.categoryName = optStr(args.categoryName);
      if (args.amount !== undefined) {
        const amt = num(args.amount);
        if (!Number.isFinite(amt) || amt <= 0) return { ok: false, error: "المبلغ يجب أن يكون أكبر من صفر" };
        patch.amount = amt;
      }
      if (Object.keys(patch).length === 0) return { ok: false, error: "لا توجد حقول للتعديل" };
      return {
        ok: true,
        action: { kind: "update_expense", summary: `تعديل مصروف: ${expense.description ?? fmt(Number(expense.amount))}`, payload: { expenseId, patch } },
      };
    },
    commit: async (ownerId, _userId, p) => {
      const expenseId = p.expenseId as string;
      const patch = p.patch as Record<string, unknown>;
      const expense = await prisma.expense.findFirst({ where: { id: expenseId, ownerId, isDeleted: false } });
      if (!expense) return { error: "المصروف غير موجود" };
      const data: Record<string, unknown> = {};
      if (patch.description !== undefined) data.description = patch.description;
      if (patch.date !== undefined) data.date = patch.date ? new Date(patch.date as string) : new Date();
      if (patch.amount !== undefined) data.amount = patch.amount;
      if (patch.categoryName) {
        const categoryName = patch.categoryName as string;
        const existing = await prisma.expenseCategory.findFirst({ where: { ownerId, name: { equals: categoryName, mode: "insensitive" }, isDeleted: false }, select: { id: true } });
        data.categoryId = existing ? existing.id : (await prisma.expenseCategory.create({ data: { ownerId, name: categoryName }, select: { id: true } })).id;
      }
      await prisma.expense.update({ where: { id: expenseId }, data });
      return { summary: "تم تعديل المصروف." };
    },
  },

  {
    name: "create_expense_category",
    description: "Create a new expense category. Admin only.",
    parameters: {
      type: "object",
      properties: { name: { type: "string" }, icon: { type: "string" }, color: { type: "string" } },
      required: ["name"],
    },
    adminOnly: true,
    preview: async (ownerId, args) => {
      const name = str(args.name);
      if (!name) return { ok: false, error: "اسم الفئة مطلوب" };
      const existing = await prisma.expenseCategory.findFirst({ where: { ownerId, name: { equals: name, mode: "insensitive" }, isDeleted: false }, select: { id: true } });
      if (existing) return { ok: false, error: `فئة بنفس الاسم موجودة مسبقًا: ${name}` };
      return {
        ok: true,
        action: { kind: "create_expense_category", summary: `إضافة فئة مصروفات جديدة: ${name}`, payload: { name, icon: optStr(args.icon), color: optStr(args.color) } },
      };
    },
    commit: async (ownerId, _userId, p) => {
      const name = p.name as string;
      const existing = await prisma.expenseCategory.findFirst({ where: { ownerId, name: { equals: name, mode: "insensitive" }, isDeleted: false }, select: { id: true } });
      if (existing) return { error: `فئة بنفس الاسم موجودة مسبقًا: ${name}` };
      await prisma.expenseCategory.create({ data: { ownerId, name, icon: (p.icon as string | null) ?? null, color: (p.color as string | null) ?? null } });
      return { summary: `تمت إضافة فئة مصروفات "${name}".` };
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
      "Move a maintenance ticket to a new status. Get the ticketId from find_ticket. Valid statuses: RECEIVED, DIAGNOSING, IN_REPAIR, WAITING_PARTS, READY, DELIVERED, CANCELLED, UNREPAIRABLE (device cannot be fixed; only legal transitions are allowed). Optional note.",
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

  {
    name: "update_ticket_details",
    description: "Edit a maintenance ticket's diagnosis, solution, cost, notes, priority, deposit, or estimated delivery date. Does NOT change the customer or device — those aren't editable via chat. All fields optional; only given fields change.",
    parameters: {
      type: "object",
      properties: {
        ticketId: { type: "string" },
        diagnosis: { type: "string" },
        solution: { type: "string" },
        finalCost: { type: "string" },
        estimatedCost: { type: "string" },
        technicianNotes: { type: "string" },
        customerNotes: { type: "string" },
        priority: { type: "string", description: "LOW | NORMAL | HIGH | URGENT" },
        depositPaid: { type: "string" },
        estimatedDelivery: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["ticketId"],
    },
    preview: async (ownerId, args) => {
      const ticketId = str(args.ticketId);
      const ticket = await prisma.maintenanceTicket.findFirst({ where: { id: ticketId, ownerId, isDeleted: false }, select: { ticketNumber: true, status: true } });
      if (!ticket) return { ok: false, error: "التذكرة غير موجودة" };
      if (ticket.status === "DELIVERED" || ticket.status === "CANCELLED") return { ok: false, error: "لا يمكن تعديل تذكرة مُسلَّمة أو ملغاة" };
      if (args.priority !== undefined && !TICKET_PRIORITIES.includes(str(args.priority).toUpperCase())) {
        return { ok: false, error: "أولوية غير معروفة" };
      }
      const fields: string[] = [];
      if (args.diagnosis !== undefined) fields.push("التشخيص");
      if (args.solution !== undefined) fields.push("الحل");
      if (args.finalCost !== undefined) fields.push("التكلفة النهائية");
      if (args.estimatedCost !== undefined) fields.push("التكلفة المتوقعة");
      if (args.technicianNotes !== undefined) fields.push("ملاحظات الفني");
      if (args.customerNotes !== undefined) fields.push("ملاحظات العميل");
      if (args.priority !== undefined) fields.push("الأولوية");
      if (args.depositPaid !== undefined) fields.push("العربون");
      if (args.estimatedDelivery !== undefined) fields.push("الموعد المتوقع");
      if (fields.length === 0) return { ok: false, error: "لم تحدد أي حقل للتعديل" };
      return {
        ok: true,
        action: {
          kind: "update_ticket_details",
          summary: `تعديل تذكرة ${ticket.ticketNumber}: ${fields.join("، ")}`,
          payload: {
            ticketId,
            diagnosis: optStr(args.diagnosis),
            solution: optStr(args.solution),
            finalCost: args.finalCost !== undefined ? num(args.finalCost) : undefined,
            estimatedCost: args.estimatedCost !== undefined ? num(args.estimatedCost) : undefined,
            technicianNotes: optStr(args.technicianNotes),
            customerNotes: optStr(args.customerNotes),
            priority: args.priority !== undefined ? str(args.priority).toUpperCase() : undefined,
            depositPaid: args.depositPaid !== undefined ? num(args.depositPaid) : undefined,
            estimatedDelivery: optStr(args.estimatedDelivery),
          },
        },
      };
    },
    commit: async (ownerId, _userId, p) => {
      const ticketId = p.ticketId as string;
      const ticket = await prisma.maintenanceTicket.findFirst({ where: { id: ticketId, ownerId, isDeleted: false }, select: { ticketNumber: true, status: true } });
      if (!ticket) return { error: "التذكرة غير موجودة" };
      if (ticket.status === "DELIVERED" || ticket.status === "CANCELLED") return { error: "لا يمكن تعديل تذكرة مُسلَّمة أو ملغاة" };
      const data: Record<string, unknown> = {};
      if (p.diagnosis !== undefined) data.diagnosis = p.diagnosis;
      if (p.solution !== undefined) data.solution = p.solution;
      if (p.finalCost !== undefined) data.finalCost = p.finalCost;
      if (p.estimatedCost !== undefined) data.estimatedCost = p.estimatedCost;
      if (p.technicianNotes !== undefined) data.technicianNotes = p.technicianNotes;
      if (p.customerNotes !== undefined) data.customerNotes = p.customerNotes;
      if (p.priority !== undefined) data.priority = p.priority as TicketPriority;
      if (p.depositPaid !== undefined) data.depositPaid = p.depositPaid;
      if (p.estimatedDelivery !== undefined) data.estimatedDelivery = p.estimatedDelivery ? new Date(p.estimatedDelivery as string) : null;
      await prisma.maintenanceTicket.update({ where: { id: ticketId }, data });
      return { summary: `تم تعديل تذكرة ${ticket.ticketNumber}.` };
    },
  },

  {
    name: "add_ticket_part",
    description: "Add a part/component used on a maintenance ticket (draws it from inventory if productId is given). Get ticketId from find_ticket and productId from find_product.",
    parameters: {
      type: "object",
      properties: {
        ticketId: { type: "string" },
        productId: { type: "string", description: "Optional — link to an inventory product to draw stock." },
        name: { type: "string" },
        qty: { type: "string" },
        unitCost: { type: "string" },
      },
      required: ["ticketId", "name", "qty", "unitCost"],
    },
    preview: async (ownerId, args) => {
      const ticketId = str(args.ticketId);
      const name = str(args.name);
      const qty = intOf(args.qty);
      const unitCost = num(args.unitCost);
      if (!name) return { ok: false, error: "اسم القطعة مطلوب" };
      if (!qty || qty < 1) return { ok: false, error: "الكمية يجب أن تكون أكبر من صفر" };
      if (!Number.isFinite(unitCost) || unitCost < 0) return { ok: false, error: "السعر غير صالح" };
      const ticket = await prisma.maintenanceTicket.findFirst({ where: { id: ticketId, ownerId, isDeleted: false }, select: { ticketNumber: true } });
      if (!ticket) return { ok: false, error: "التذكرة غير موجودة" };
      const productId = optStr(args.productId);
      if (productId) {
        const product = await prisma.product.findFirst({ where: { id: productId, ownerId, isDeleted: false }, select: { id: true } });
        if (!product) return { ok: false, error: "المنتج غير موجود" };
      }
      return {
        ok: true,
        action: {
          kind: "add_ticket_part",
          summary: `إضافة قطعة "${name}" (${qty} × ${fmt(unitCost)}) لتذكرة ${ticket.ticketNumber}`,
          payload: { ticketId, productId, name, qty, unitCost },
        },
      };
    },
    commit: async (ownerId, userId, p) => {
      const ticketId = p.ticketId as string;
      const productId = p.productId as string | null;
      const qty = p.qty as number;
      const unitCost = p.unitCost as number;
      const ticket = await prisma.maintenanceTicket.findFirst({ where: { id: ticketId, ownerId, isDeleted: false }, select: { ticketNumber: true } });
      if (!ticket) return { error: "التذكرة غير موجودة" };
      try {
        await prisma.$transaction(async (tx) => {
          await tx.ticketPart.create({
            data: { ticketId, productId, name: p.name as string, qty, unitCost, total: qty * unitCost },
          });
          if (productId) {
            await issueStockFromInventory(tx, { ownerId, userId, productId, qty, note: `قطعة لتذكرة ${ticket.ticketNumber}`, reference: ticket.ticketNumber });
          }
        });
        return { summary: `تمت إضافة القطعة لتذكرة ${ticket.ticketNumber}.` };
      } catch (e) {
        if (e instanceof InsufficientStockError) return { error: e.message };
        throw e;
      }
    },
  },

  {
    name: "remove_ticket_part",
    description: "Remove a part previously added to a maintenance ticket (returns any drawn stock to inventory). partId is the TicketPart id — list a ticket's parts via find_ticket first if unsure.",
    parameters: {
      type: "object",
      properties: { ticketId: { type: "string" }, partId: { type: "string" } },
      required: ["ticketId", "partId"],
    },
    preview: async (ownerId, args) => {
      const ticketId = str(args.ticketId);
      const partId = str(args.partId);
      const ticket = await prisma.maintenanceTicket.findFirst({ where: { id: ticketId, ownerId, isDeleted: false }, select: { ticketNumber: true } });
      if (!ticket) return { ok: false, error: "التذكرة غير موجودة" };
      const part = await prisma.ticketPart.findFirst({ where: { id: partId, ticketId }, select: { name: true } });
      if (!part) return { ok: false, error: "القطعة غير موجودة" };
      return {
        ok: true,
        action: {
          kind: "remove_ticket_part",
          summary: `حذف القطعة "${part.name}" من تذكرة ${ticket.ticketNumber}`,
          payload: { ticketId, partId },
        },
      };
    },
    commit: async (ownerId, userId, p) => {
      const ticketId = p.ticketId as string;
      const partId = p.partId as string;
      const part = await prisma.ticketPart.findFirst({ where: { id: partId, ticketId } });
      if (!part) return { error: "القطعة غير موجودة" };
      await prisma.$transaction(async (tx) => {
        await tx.ticketPart.delete({ where: { id: partId } });
        if (part.productId) {
          await returnStockToInventory(tx, { ownerId, userId, productId: part.productId, qty: part.qty, note: "إلغاء قطعة من تذكرة", reference: ticketId });
        }
      });
      return { summary: "تم حذف القطعة." };
    },
  },

  {
    name: "add_ticket_note",
    description: "Add a free-text timeline note to a maintenance ticket without changing its status.",
    parameters: {
      type: "object",
      properties: { ticketId: { type: "string" }, note: { type: "string" } },
      required: ["ticketId", "note"],
    },
    preview: async (ownerId, args) => {
      const ticketId = str(args.ticketId);
      const note = str(args.note);
      if (!note) return { ok: false, error: "الملاحظة مطلوبة" };
      const ticket = await prisma.maintenanceTicket.findFirst({ where: { id: ticketId, ownerId, isDeleted: false }, select: { ticketNumber: true } });
      if (!ticket) return { ok: false, error: "التذكرة غير موجودة" };
      return {
        ok: true,
        action: { kind: "add_ticket_note", summary: `إضافة ملاحظة لتذكرة ${ticket.ticketNumber}: "${note}"`, payload: { ticketId, note } },
      };
    },
    commit: async (ownerId, userId, p) => {
      const ticketId = p.ticketId as string;
      const ticket = await prisma.maintenanceTicket.findFirst({ where: { id: ticketId, ownerId, isDeleted: false }, select: { ticketNumber: true, status: true } });
      if (!ticket) return { error: "التذكرة غير موجودة" };
      await prisma.ticketUpdate.create({ data: { ticketId, status: ticket.status, note: p.note as string, createdById: userId } });
      return { summary: `تمت إضافة الملاحظة لتذكرة ${ticket.ticketNumber}.` };
    },
  },

  // ── employees ──────────────────────────────────────────────────────────────
  {
    name: "create_employee",
    description: "Invite a new employee to work in this shop by email — sends them a real invitation email to set up their account. Admin only.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        role: { type: "string", description: "ADMIN | STAFF" },
      },
      required: ["name", "email", "role"],
    },
    adminOnly: true,
    preview: async (_ownerId, args) => {
      const name = str(args.name);
      const email = str(args.email).toLowerCase();
      const role = str(args.role).toUpperCase();
      if (!name) return { ok: false, error: "الاسم مطلوب" };
      if (!email.includes("@")) return { ok: false, error: "بريد إلكتروني غير صالح" };
      if (role !== "ADMIN" && role !== "STAFF") return { ok: false, error: "الصلاحية يجب أن تكون ADMIN أو STAFF" };
      const existing = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } });
      if (existing) return { ok: false, error: "هذا البريد الإلكتروني مستخدم مسبقًا" };
      return {
        ok: true,
        action: {
          kind: "create_employee",
          summary: `دعوة موظف جديد: ${name} (${email}) — ${role === "ADMIN" ? "مدير" : "موظف"}`,
          warn: "سيتم إرسال بريد دعوة فعلي لهذا العنوان.",
          payload: { name, email, role },
        },
      };
    },
    commit: async (ownerId, _userId, p) => {
      const name = p.name as string;
      const email = p.email as string;
      const role = p.role as UserRole;
      const existing = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
      if (existing) return { error: "هذا البريد الإلكتروني مستخدم مسبقًا" };
      const admin = createAdminClient();
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { name },
        redirectTo: "https://manage.mtcelectronics.com/reset-password",
      });
      if (error || !data.user) {
        console.error("chat create_employee invite failed", error);
        return { error: "تعذّر إرسال الدعوة عبر البريد الإلكتروني" };
      }
      try {
        await prisma.user.create({ data: { id: data.user.id, name, email, role, shopOwnerId: ownerId } });
        return { summary: `تم إرسال دعوة إلى ${email}.` };
      } catch (e) {
        console.error("failed to create employee row after invite", e);
        return { error: "تم إرسال الدعوة لكن حدث خطأ أثناء حفظ بيانات الموظف" };
      }
    },
  },

  {
    name: "update_employee",
    description: "Edit an employee's name, role, or active status. Get the employee id from get_employees. Admin only.",
    parameters: {
      type: "object",
      properties: {
        employeeId: { type: "string" },
        name: { type: "string" },
        role: { type: "string", description: "ADMIN | STAFF" },
        isActive: { type: "string", description: "true | false" },
      },
      required: ["employeeId"],
    },
    adminOnly: true,
    preview: async (ownerId, args) => {
      const employeeId = str(args.employeeId);
      const employee = await prisma.user.findFirst({ where: { id: employeeId, shopOwnerId: ownerId, isDeleted: false }, select: { name: true } });
      if (!employee) return { ok: false, error: "الموظف غير موجود" };
      const patch: Record<string, unknown> = {};
      if (args.name !== undefined) patch.name = str(args.name) || employee.name;
      if (args.role !== undefined) {
        const role = str(args.role).toUpperCase();
        if (role !== "ADMIN" && role !== "STAFF") return { ok: false, error: "الصلاحية يجب أن تكون ADMIN أو STAFF" };
        patch.role = role;
      }
      if (args.isActive !== undefined) patch.isActive = str(args.isActive).toLowerCase() === "true";
      if (Object.keys(patch).length === 0) return { ok: false, error: "لا توجد حقول للتعديل" };
      return {
        ok: true,
        action: { kind: "update_employee", summary: `تعديل الموظف "${employee.name}"`, payload: { employeeId, patch } },
      };
    },
    commit: async (ownerId, _userId, p) => {
      const employeeId = p.employeeId as string;
      const patch = p.patch as Record<string, unknown>;
      const employee = await prisma.user.findFirst({ where: { id: employeeId, shopOwnerId: ownerId, isDeleted: false } });
      if (!employee) return { error: "الموظف غير موجود" };
      const updated = await prisma.user.update({ where: { id: employeeId }, data: patch });
      invalidateUserCache(updated.email);
      return { summary: `تم تعديل الموظف "${updated.name}".` };
    },
  },

  {
    name: "deactivate_employee",
    description: "Deactivate (soft-delete) an employee, locking them out. Get the employee id from get_employees. Admin only.",
    parameters: {
      type: "object",
      properties: { employeeId: { type: "string" } },
      required: ["employeeId"],
    },
    adminOnly: true,
    preview: async (ownerId, args) => {
      const employeeId = str(args.employeeId);
      const employee = await prisma.user.findFirst({ where: { id: employeeId, shopOwnerId: ownerId, isDeleted: false }, select: { name: true } });
      if (!employee) return { ok: false, error: "الموظف غير موجود" };
      return {
        ok: true,
        action: { kind: "deactivate_employee", summary: `تعطيل الموظف "${employee.name}"`, warn: "لن يتمكن هذا الموظف من تسجيل الدخول بعد التعطيل.", payload: { employeeId } },
      };
    },
    commit: async (ownerId, _userId, p) => {
      const employeeId = p.employeeId as string;
      const employee = await prisma.user.findFirst({ where: { id: employeeId, shopOwnerId: ownerId, isDeleted: false } });
      if (!employee) return { error: "الموظف غير موجود" };
      await prisma.user.update({ where: { id: employeeId }, data: { isDeleted: true, isActive: false } });
      invalidateUserCache(employee.email);
      return { summary: `تم تعطيل الموظف "${employee.name}".` };
    },
  },

  // ── profile ───────────────────────────────────────────────────────────────────
  {
    name: "update_profile",
    description: "Edit the current user's own name, phone, or address.",
    parameters: {
      type: "object",
      properties: { name: { type: "string" }, phone: { type: "string" }, address: { type: "string" } },
    },
    preview: async (_ownerId, args) => {
      const patch: Record<string, string | null> = {};
      if (args.name !== undefined) {
        const name = str(args.name);
        if (!name) return { ok: false, error: "الاسم مطلوب" };
        patch.name = name;
      }
      if (args.phone !== undefined) patch.phone = optStr(args.phone);
      if (args.address !== undefined) patch.address = optStr(args.address);
      if (Object.keys(patch).length === 0) return { ok: false, error: "لا توجد حقول للتعديل" };
      return {
        ok: true,
        action: { kind: "update_profile", summary: "تعديل بيانات حسابك الشخصية", payload: { patch } },
      };
    },
    commit: async (_ownerId, userId, p) => {
      const patch = p.patch as Record<string, string | null>;
      const updated = await prisma.user.update({ where: { id: userId }, data: patch, select: { email: true } });
      invalidateUserCache(updated.email);
      return { summary: "تم تعديل بياناتك الشخصية." };
    },
  },

  // ── storefront ─────────────────────────────────────────────────────────────
  {
    name: "sync_store_products",
    description: "Manually trigger a sync of the public storefront's catalog from this system's inventory. Can take a while on a large catalog.",
    parameters: { type: "object", properties: {}, required: [] },
    preview: async () => ({
      ok: true,
      action: { kind: "sync_store_products", summary: "مزامنة كتالوج المتجر الإلكتروني من المخزون الحالي", payload: {} },
    }),
    commit: async (ownerId) => {
      const { runManagementSync } = await import("./store/sync");
      try {
        const report = await runManagementSync(ownerId, { source: "manual" });
        if (!report.ok) return { error: report.message ?? "فشلت المزامنة" };
        return { summary: `تمت المزامنة: ${report.productsUpserted} منتج محدّث، ${report.deactivated} معطّل.` };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "تعذّرت المزامنة" };
      }
    },
  },

  {
    name: "create_store_product",
    description: "Create a new manual product on the public storefront (independent of inventory sync). name and price are required; category/description/stockQty/currency/status are optional. Images and variants aren't settable via chat — add those from the store admin UI afterward.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        price: { type: "string" },
        category: { type: "string" },
        description: { type: "string" },
        stockQty: { type: "string" },
        currency: { type: "string", description: "ILS | USD, default ILS" },
        status: { type: "string", description: "draft | published, default draft" },
      },
      required: ["name", "price"],
    },
    preview: async (_ownerId, args) => {
      const name = str(args.name);
      const price = num(args.price);
      if (!name) return { ok: false, error: "اسم المنتج مطلوب" };
      if (!Number.isFinite(price) || price < 0) return { ok: false, error: "السعر غير صالح" };
      const status = str(args.status).toLowerCase() || "draft";
      if (!["draft", "published", "archived"].includes(status)) return { ok: false, error: "حالة غير معروفة" };
      return {
        ok: true,
        action: {
          kind: "create_store_product",
          summary: `إضافة منتج جديد للمتجر الإلكتروني: ${name} (${fmt(price)})`,
          payload: {
            name, price, category: optStr(args.category), description: optStr(args.description),
            stockQty: args.stockQty !== undefined ? intOf(args.stockQty) : 0,
            currency: str(args.currency).toUpperCase() || "ILS", status,
          },
        },
      };
    },
    commit: async (_ownerId, _userId, p) => {
      const { createStoreProduct } = await import("./store/products");
      try {
        const result = await createStoreProduct({
          name: p.name as string, price: p.price as number,
          category: (p.category as string | null) ?? undefined,
          description: (p.description as string | null) ?? undefined,
          stockQty: p.stockQty as number,
          currency: p.currency as "ILS" | "USD",
          status: p.status as "draft" | "published" | "archived",
          kind: "physical", images: [], variants: [],
        });
        return { summary: `تمت إضافة المنتج "${p.name}" للمتجر الإلكتروني (${result.slug}).` };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "تعذّرت إضافة المنتج" };
      }
    },
  },

  {
    name: "update_store_product",
    description: "Update a manual storefront product's price, category, description, stock, or status. Resolve the id via find_store_product first. Only works on manual products, not synced ones (edit those from the store admin UI instead).",
    parameters: {
      type: "object",
      properties: {
        productId: { type: "string" },
        name: { type: "string" },
        price: { type: "string" },
        category: { type: "string" },
        description: { type: "string" },
        stockQty: { type: "string" },
        status: { type: "string", description: "draft | published | archived" },
      },
      required: ["productId"],
    },
    preview: async (_ownerId, args) => {
      const { getStoreDb } = await import("./store/db");
      const { storeProducts } = await import("./store/schema");
      const { eq } = await import("drizzle-orm");
      const db = getStoreDb();
      if (!db) return { ok: false, error: "قاعدة بيانات المتجر غير مهيأة" };
      const id = intOf(args.productId);
      const [existing] = await db.select().from(storeProducts).where(eq(storeProducts.id, id)).limit(1);
      if (!existing) return { ok: false, error: "المنتج غير موجود" };
      if (existing.origin !== "manual") return { ok: false, error: "المنتجات المزامنة تُعدل من واجهة إدارة المتجر" };
      // categorySlug is a slug, not the display name updateStoreManualProduct
      // expects — resolve the current category's actual name as the default.
      let currentCategoryName: string | null = null;
      if (existing.categorySlug) {
        const { storeCategories } = await import("./store/schema");
        const [cat] = await db.select({ name: storeCategories.name }).from(storeCategories).where(eq(storeCategories.slug, existing.categorySlug)).limit(1);
        currentCategoryName = cat?.name ?? null;
      }
      return {
        ok: true,
        action: {
          kind: "update_store_product",
          summary: `تعديل منتج المتجر "${existing.name}"`,
          payload: {
            productId: id,
            name: args.name !== undefined ? str(args.name) : existing.name,
            price: args.price !== undefined ? num(args.price) : Number(existing.price),
            category: args.category !== undefined ? str(args.category) : currentCategoryName,
            description: args.description !== undefined ? str(args.description) : existing.description,
            stockQty: args.stockQty !== undefined ? intOf(args.stockQty) : existing.stockQty,
            status: args.status !== undefined ? str(args.status).toLowerCase() : existing.status,
            currency: existing.currency,
            kind: existing.kind,
          },
        },
      };
    },
    commit: async (_ownerId, _userId, p) => {
      const { updateStoreManualProduct } = await import("./store/products");
      try {
        const result = await updateStoreManualProduct(p.productId as number, {
          name: p.name as string, price: p.price as number,
          category: (p.category as string | null) ?? undefined,
          description: (p.description as string | null) ?? undefined,
          stockQty: p.stockQty as number,
          currency: p.currency as "ILS" | "USD",
          status: p.status as "draft" | "published" | "archived",
          kind: p.kind as "physical" | "digital", images: [], variants: [],
        });
        return { summary: `تم تعديل المنتج (${result.slug}).` };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "تعذّر تعديل المنتج" };
      }
    },
  },

  {
    name: "create_content_page",
    description: "Create a new custom page on the public storefront (starts as a hidden draft with a starter text block). titleEn/titleAr set the page title; slug is optional (derived from the title if omitted).",
    parameters: {
      type: "object",
      properties: { titleEn: { type: "string" }, titleAr: { type: "string" }, slug: { type: "string" } },
    },
    preview: async (_ownerId, args) => {
      const titleEn = str(args.titleEn);
      const titleAr = str(args.titleAr);
      if (!titleEn && !titleAr) return { ok: false, error: "أدخل عنوانًا للصفحة" };
      return {
        ok: true,
        action: { kind: "create_content_page", summary: `إنشاء صفحة جديدة بالمتجر: ${titleAr || titleEn}`, payload: { titleEn, titleAr, slug: optStr(args.slug) } },
      };
    },
    commit: async (_ownerId, _userId, p) => {
      const { createStorePage } = await import("./store/content");
      try {
        const slug = await createStorePage(p.titleEn as string, p.titleAr as string, (p.slug as string | null) ?? undefined);
        return { summary: `تم إنشاء الصفحة (${slug}) كمسودة.` };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "تعذّر إنشاء الصفحة" };
      }
    },
  },

  {
    name: "publish_content_page",
    description: "Publish a storefront page's current draft content as-is (makes it visible to customers). Does not change the page's content — only use this to publish what's already been drafted in the store admin UI.",
    parameters: { type: "object", properties: { slug: { type: "string" } }, required: ["slug"] },
    preview: async (_ownerId, args) => {
      const { getStorePageForEditor } = await import("./store/content");
      const slug = str(args.slug);
      const page = await getStorePageForEditor(slug);
      if (!page) return { ok: false, error: "الصفحة غير موجودة" };
      return {
        ok: true,
        action: { kind: "publish_content_page", summary: `نشر صفحة "${page.titleAr || page.titleEn || slug}"`, payload: { slug } },
      };
    },
    commit: async (_ownerId, _userId, p) => {
      const { getStorePageForEditor, publishPage } = await import("./store/content");
      const slug = p.slug as string;
      try {
        const page = await getStorePageForEditor(slug);
        if (!page) return { error: "الصفحة غير موجودة" };
        await publishPage(slug, page.layout);
        return { summary: `تم نشر الصفحة "${page.titleAr || page.titleEn || slug}".` };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "تعذّر نشر الصفحة" };
      }
    },
  },

  {
    name: "update_store_settings",
    description: "Update the storefront's announcement banner and/or footer tagline, and publish the change site-wide. Only given fields change; everything else (nav, theme, footer columns) stays as-is.",
    parameters: {
      type: "object",
      properties: {
        announcementEnabled: { type: "string", description: "true | false" },
        announcementTextEn: { type: "string" },
        announcementTextAr: { type: "string" },
        footerTaglineEn: { type: "string" },
        footerTaglineAr: { type: "string" },
      },
    },
    preview: async (_ownerId, args) => {
      if (Object.keys(args).length === 0) return { ok: false, error: "لم تحدد أي إعداد للتعديل" };
      return {
        ok: true,
        action: { kind: "update_store_settings", summary: "تحديث إعدادات المتجر ونشرها", payload: { ...args } },
      };
    },
    commit: async (_ownerId, _userId, p) => {
      const { getSiteSettingsForEditor, publishSiteSettings } = await import("./store/content");
      try {
        const { config } = await getSiteSettingsForEditor();
        if (p.announcementEnabled !== undefined) config.announcement.enabled = str(p.announcementEnabled).toLowerCase() === "true";
        if (p.announcementTextEn !== undefined) config.announcement.text.en = p.announcementTextEn as string;
        if (p.announcementTextAr !== undefined) config.announcement.text.ar = p.announcementTextAr as string;
        if (p.footerTaglineEn !== undefined) config.footer.tagline.en = p.footerTaglineEn as string;
        if (p.footerTaglineAr !== undefined) config.footer.tagline.ar = p.footerTaglineAr as string;
        await publishSiteSettings(config);
        return { summary: "تم تحديث إعدادات المتجر ونشرها." };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "تعذّر تحديث الإعدادات" };
      }
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
      "Delete a record. entity is one of: customer, supplier, product, invoice, expense, debt, ticket, payable, category, store_product, content_page. Deleting an invoice returns its stock to inventory and voids its linked debts; deleting a ticket returns its parts to stock. A debt backed by an invoice cannot be deleted directly — delete its invoice instead. Deleting an expense requires admin. Resolve the id with the matching find_/get_ tool first.",
    parameters: {
      type: "object",
      properties: {
        entity: { type: "string", description: "customer | supplier | product | invoice | expense | debt | ticket | payable | category | store_product | content_page" },
        id: { type: "string", description: "For store_product this is the numeric id; for content_page this is the page slug." },
      },
      required: ["entity", "id"],
    },
    preview: async (ownerId, args) => {
      const entity = str(args.entity).toLowerCase();
      const id = str(args.id);
      const labels: Record<string, string> = {
        customer: "العميل", supplier: "المورد", product: "المنتج", invoice: "الفاتورة",
        expense: "المصروف", debt: "الدين", ticket: "تذكرة الصيانة", payable: "المستحق",
        category: "الفئة", store_product: "منتج المتجر", content_page: "صفحة المتجر",
      };
      if (!labels[entity]) return { ok: false, error: "نوع السجل غير مدعوم للحذف" };
      if (entity === "store_product") {
        const { getStoreDb } = await import("./store/db");
        const { storeProducts } = await import("./store/schema");
        const { eq } = await import("drizzle-orm");
        const db = getStoreDb();
        if (!db) return { ok: false, error: "قاعدة بيانات المتجر غير مهيأة" };
        const [product] = await db.select().from(storeProducts).where(eq(storeProducts.id, Number(id))).limit(1);
        if (!product) return { ok: false, error: "منتج المتجر غير موجود" };
        if (product.origin !== "manual") return { ok: false, error: "المنتجات المزامنة تُؤرشف من واجهة إدارة المتجر ولا تُحذف" };
        return { ok: true, action: { kind: "delete_record", summary: `حذف منتج المتجر: ${product.name}`, warn: "لا يمكن التراجع عن الحذف.", payload: { entity, id } } };
      }
      if (entity === "content_page") {
        const { getStorePageForEditor } = await import("./store/content");
        const page = await getStorePageForEditor(id);
        if (!page) return { ok: false, error: "الصفحة غير موجودة" };
        return { ok: true, action: { kind: "delete_record", summary: `حذف صفحة المتجر: ${page.titleAr || page.titleEn || id}`, warn: "لا يمكن التراجع عن الحذف.", payload: { entity, id } } };
      }
      let name = "";
      switch (entity) {
        case "customer": name = (await prisma.customer.findFirst({ where: { id, ownerId }, select: { name: true } }))?.name ?? ""; break;
        case "supplier": name = (await prisma.supplier.findFirst({ where: { id, ownerId }, select: { name: true } }))?.name ?? ""; break;
        case "product": name = (await prisma.product.findFirst({ where: { id, ownerId }, select: { name: true } }))?.name ?? ""; break;
        case "invoice": name = (await prisma.invoice.findFirst({ where: { id, ownerId }, select: { invoiceNumber: true } }))?.invoiceNumber ?? ""; break;
        case "expense": { const e = await prisma.expense.findFirst({ where: { id, ownerId }, select: { amount: true, description: true } }); name = e ? (e.description ?? fmt(Number(e.amount))) : ""; break; }
        case "debt": { const d = await prisma.debt.findFirst({ where: { id, ownerId }, select: { amount: true, customer: { select: { name: true } } } }); name = d ? `${d.customer.name} — ${fmt(Number(d.amount))}` : ""; break; }
        case "ticket": name = (await prisma.maintenanceTicket.findFirst({ where: { id, ownerId }, select: { ticketNumber: true } }))?.ticketNumber ?? ""; break;
        case "payable": { const pay = await prisma.payable.findFirst({ where: { id, ownerId }, select: { amount: true, supplier: { select: { name: true } } } }); name = pay ? `${pay.supplier.name} — ${fmt(Number(pay.amount))}` : ""; break; }
        case "category": name = (await prisma.category.findFirst({ where: { id, ownerId }, select: { name: true } }))?.name ?? ""; break;
      }
      if (!name) return { ok: false, error: `${labels[entity]} غير موجود` };
      const sideEffect =
        entity === "invoice"
          ? " (سيُرجَع المخزون وتُلغى الديون المرتبطة)"
          : entity === "ticket"
          ? " (ستُرجَع قطع الغيار للمخزون)"
          : "";
      return {
        ok: true,
        action: {
          kind: "delete_record",
          summary: `حذف ${labels[entity]}: ${name}${sideEffect}`,
          warn: "لا يمكن التراجع عن الحذف.",
          payload: { entity, id },
        },
      };
    },
    commit: async (ownerId, userId, p) => {
      const entity = p.entity as string;
      const id = p.id as string;

      // These two live in the separate storefront DB (Drizzle, not Prisma) —
      // handled outside the Prisma transaction below.
      if (entity === "store_product") {
        const { deleteStoreProduct } = await import("./store/products");
        try {
          await deleteStoreProduct(Number(id));
          return { summary: "تم حذف منتج المتجر." };
        } catch (e) {
          return { error: e instanceof Error ? e.message : "تعذّر الحذف" };
        }
      }
      if (entity === "content_page") {
        const { deleteStorePage } = await import("./store/content");
        try {
          await deleteStorePage(id);
          return { summary: "تم حذف صفحة المتجر." };
        } catch (e) {
          return { error: e instanceof Error ? e.message : "تعذّر الحذف" };
        }
      }

      // Route every delete through the same soft-delete logic the REST API
      // uses, so the assistant reverses stock and voids linked debts instead
      // of hard-deleting and leaving the books inconsistent.
      const softDelete = (model: { updateMany: (a: { where: object; data: object }) => Promise<{ count: number }> }, data: object = { isDeleted: true }) =>
        model.updateMany({ where: { id, ownerId, isDeleted: false }, data }).then((r) => (r.count > 0 ? "ok" : "not_found"));
      try {
        const result = await prisma.$transaction(async (tx) => {
          switch (entity) {
            case "customer": return softDelete(tx.customer);
            case "supplier": return softDelete(tx.supplier);
            case "product": return softDelete(tx.product, { isDeleted: true, isActive: false });
            case "expense": return softDelete(tx.expense);
            case "category": return softDelete(tx.category);
            case "invoice": return (await softDeleteInvoice(tx, ownerId, userId, id)) ? "ok" : "not_found";
            case "ticket": return (await softDeleteTicket(tx, ownerId, userId, id)) ? "ok" : "not_found";
            case "debt": {
              const r = await softDeleteDebt(tx, ownerId, id);
              return r === "deleted" ? "ok" : r; // "not_found" | "linked"
            }
            case "payable": {
              const r = await softDeletePayable(tx, ownerId, id);
              return r === "deleted" ? "ok" : r; // "not_found"
            }
            default: return "unsupported";
          }
        });
        if (result === "unsupported") return { error: "نوع السجل غير مدعوم" };
        if (result === "not_found") return { error: "السجل غير موجود" };
        if (result === "linked") return { error: "هذا الدين مرتبط بفاتورة. احذف الفاتورة بدلًا من ذلك." };
        return { summary: "تم الحذف." };
      } catch (e) {
        console.error("chat delete_record", e);
        return { error: "تعذّر الحذف. حاول مرة أخرى." };
      }
    },
  },
];

const ACTION_INDEX = new Map(ACTIONS.map((a) => [a.name, a]));

export function getActionToolSchemas(role: UserRole) {
  return ACTIONS.filter((a) => !a.adminOnly || role === "ADMIN").map((a) => ({
    type: "function" as const,
    function: { name: a.name, description: a.description, parameters: a.parameters },
  }));
}

export function isActionTool(name: string): boolean {
  return ACTION_INDEX.has(name);
}

// delete_record handles many entity types via one action; only "expense" is
// admin-restricted (mirrors DELETE /api/expenses/[id]'s withAdmin gate), so it
// can't just be marked adminOnly on the whole action like the others below.
function isAdminRestricted(name: string, role: UserRole, args: Record<string, unknown>): boolean {
  const tool = ACTION_INDEX.get(name);
  if (tool?.adminOnly && role !== "ADMIN") return true;
  if (name === "delete_record" && str(args.entity).toLowerCase() === "expense" && role !== "ADMIN") return true;
  return false;
}

export async function previewAction(
  name: string,
  ownerId: string,
  role: UserRole,
  args: Record<string, unknown>
): Promise<PreviewResult> {
  const tool = ACTION_INDEX.get(name);
  if (!tool) return { ok: false, error: `unknown_action:${name}` };
  if (isAdminRestricted(name, role, args)) {
    return { ok: false, error: "هذه العملية تتطلب صلاحيات المدير" };
  }
  try {
    return await tool.preview(ownerId, args);
  } catch (e) {
    console.error(`preview ${name} failed:`, e);
    return { ok: false, error: "تعذّر تجهيز العملية" };
  }
}

export async function commitAction(
  ownerId: string,
  role: UserRole,
  userId: string,
  action: StagedAction
): Promise<CommitResult> {
  const tool = ACTION_INDEX.get(action.kind);
  if (!tool) return { error: "عملية غير معروفة" };
  if (isAdminRestricted(action.kind, role, action.payload)) {
    return { error: "هذه العملية تتطلب صلاحيات المدير" };
  }
  try {
    return await tool.commit(ownerId, userId, action.payload);
  } catch (e) {
    console.error(`commit ${action.kind} failed:`, e);
    return { error: "فشل تنفيذ العملية" };
  }
}
