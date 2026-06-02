import { NextRequest, NextResponse } from "next/server";
import { ok } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { InvoiceStatus } from "@prisma/client";
import { issueStockFromInventory, returnStockToInventory, InsufficientStockError } from "@/lib/stock";
import { requireUser } from "@/lib/auth";
import { softDeleteInvoice } from "@/lib/services/invoices";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const { id } = await params;
    const invoice = await prisma.invoice.findFirst({
      where: { id, ownerId: ctx.dbUser.id, isDeleted: false },
      include: {
        customer: true,
        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
        debts: {
          where: { isDeleted: false },
          include: { payments: true },
        },
        createdBy: { select: { id: true, name: true } },
      },
    });
    if (!invoice) return ok({ error: "الفاتورة غير موجودة" }, { status: 404 });
    return ok(invoice);
  } catch (e) {
    console.error(e);
    return ok({ error: "خطأ في الخادم" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const { id } = await params;
    const body = await req.json();
    const { status: newStatus, notes } = body;

    const invoice = await prisma.invoice.findFirst({
      where: { id, ownerId: ctx.dbUser.id, isDeleted: false },
      include: { items: true, debts: { where: { isDeleted: false } } },
    });
    if (!invoice) return ok({ error: "الفاتورة غير موجودة" }, { status: 404 });

    const validTransitions: Record<InvoiceStatus, InvoiceStatus[]> = {
      DRAFT: ["ISSUED", "CANCELLED"],
      ISSUED: ["PARTIAL", "PAID", "CANCELLED"],
      PARTIAL: ["PAID", "CANCELLED"],
      PAID: [],
      CANCELLED: [],
    };

    if (newStatus && !validTransitions[invoice.status].includes(newStatus)) {
      return ok({ error: "تحويل الحالة غير مسموح" }, { status: 400 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (newStatus === "ISSUED" && invoice.status === "DRAFT") {
        for (const item of invoice.items) {
          if (item.productId && item.qty > 0) {
            await issueStockFromInventory(tx, {
              ownerId: ctx.dbUser.id,
              userId: ctx.dbUser.id,
              productId: item.productId,
              qty: item.qty,
              note: `فاتورة ${invoice.invoiceNumber}`,
              reference: invoice.invoiceNumber,
            });
          }
        }

        const remaining = Number(invoice.remainingAmount);
        if (remaining > 0 && invoice.debts.length === 0) {
          await tx.debt.create({
            data: {
              ownerId: ctx.dbUser.id,
              customerId: invoice.customerId,
              invoiceId: invoice.id,
              amount: remaining,
              currency: invoice.currency,
              reason: `فاتورة ${invoice.invoiceNumber}`,
              status: "PENDING",
            },
          });
        }

        if (invoice.ticketId) {
          await tx.maintenanceTicket.update({
            where: { id: invoice.ticketId },
            data: { status: "DELIVERED", deliveredAt: new Date() },
          });
          await tx.ticketUpdate.create({
            data: {
              ticketId: invoice.ticketId,
              status: "DELIVERED",
              note: `تم التسليم وإصدار الفاتورة ${invoice.invoiceNumber}`,
              createdById: ctx.dbUser.id,
            },
          });
        }
      }

      if (newStatus === "CANCELLED" && invoice.status !== "DRAFT") {
        for (const item of invoice.items) {
          if (item.productId && item.qty > 0) {
            await returnStockToInventory(tx, {
              ownerId: ctx.dbUser.id,
              userId: ctx.dbUser.id,
              productId: item.productId,
              qty: item.qty,
              note: `إلغاء فاتورة ${invoice.invoiceNumber}`,
              reference: invoice.invoiceNumber,
            });
          }
        }

        // Soft-delete any debt auto-created when the invoice was issued.
        // Existing DebtPayment rows stay as the historical record — refunds
        // (if any) are a separate accounting decision.
        await tx.debt.updateMany({
          where: { invoiceId: id, isDeleted: false },
          data: { isDeleted: true },
        });
      }

      return tx.invoice.update({
        where: { id },
        data: {
          ...(newStatus ? { status: newStatus as InvoiceStatus } : {}),
          ...(notes !== undefined ? { notes } : {}),
          // A cancelled invoice owes nothing. total / paidAmount stay for
          // historical reference (and any refund tracking later).
          ...(newStatus === "CANCELLED" ? { remainingAmount: 0 } : {}),
        },
        include: {
          customer: true,
          items: { include: { product: { select: { id: true, name: true, sku: true } } } },
          debts: { where: { isDeleted: false }, include: { payments: true } },
        },
      });
    });

    return ok(updated);
  } catch (e) {
    if (e instanceof InsufficientStockError) {
      return ok({ error: e.message }, { status: 409 });
    }
    console.error(e);
    return ok({ error: "خطأ في الخادم" }, { status: 500 });
  }
}

type InvoiceItemInput = {
  productId?: string | null;
  name: string;
  qty: number;
  unitPrice: number;
  discount?: number;
  source?: "SALE" | "TICKET_PART" | "TICKET_LABOR";
};

type EditBody = {
  items: InvoiceItemInput[];
  customerId?: string;
  discountAmount?: number;
  discountPercent?: number;
  taxPercent?: number;
  deliveryFee?: number;
  notes?: string | null;
  debt?: { dueDate?: string | null; notes?: string | null } | null;
};

/**
 * Full edit of an invoice — items, discounts, tax, notes, debt details.
 * Reverses every stock movement made for the old items, deletes them, then
 * re-applies items + stock movements for the new set inside one transaction.
 * Linked debt is recomputed: its amount becomes the new remaining; if that
 * remaining drops to zero the debt is soft-deleted; if no debt existed and
 * remaining > 0 a new one is created. Cannot drop newTotal below
 * paidAmount — refund/cancel first.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const { id } = await params;
    const body = (await req.json()) as EditBody;
    const {
      items,
      customerId: newCustomerId,
      discountAmount = 0,
      discountPercent = 0,
      taxPercent = 0,
      deliveryFee = 0,
      notes,
      debt: debtDetails,
    } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return ok({ error: "يجب إضافة منتج واحد على الأقل" }, { status: 400 });
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id, ownerId: ctx.dbUser.id, isDeleted: false },
      include: { items: true, debts: { where: { isDeleted: false }, include: { payments: true } } },
    });
    if (!invoice) return ok({ error: "الفاتورة غير موجودة" }, { status: 404 });
    if (invoice.status === "CANCELLED") {
      return ok({ error: "لا يمكن تعديل فاتورة ملغاة" }, { status: 400 });
    }

    // Customer can be swapped, except on ticket-linked invoices — the ticket
    // belongs to the original customer and re-pointing the invoice would
    // create a mismatch with the device owner.
    const customerChanged = !!newCustomerId && newCustomerId !== invoice.customerId;
    if (customerChanged) {
      if (invoice.ticketId) {
        return ok(
          { error: "لا يمكن تغيير العميل على فاتورة مرتبطة بتذكرة صيانة" },
          { status: 400 }
        );
      }
      const target = await prisma.customer.findFirst({
        where: { id: newCustomerId, ownerId: ctx.dbUser.id, isDeleted: false },
        select: { id: true },
      });
      if (!target) return ok({ error: "العميل غير موجود" }, { status: 404 });
    }

    const subtotal = items.reduce(
      (sum, item) => sum + item.qty * item.unitPrice - (item.discount ?? 0),
      0
    );
    const discAmt = discountPercent > 0 ? subtotal * (discountPercent / 100) : discountAmount;
    const taxableAmount = subtotal - discAmt;
    const taxAmount = taxPercent > 0 ? taxableAmount * (taxPercent / 100) : 0;
    const delivery = Math.max(0, Number(deliveryFee) || 0);
    const newTotal = taxableAmount + taxAmount + delivery;
    const paid = Number(invoice.paidAmount);

    if (newTotal < paid) {
      return ok(
        {
          error: `الإجمالي الجديد (${newTotal.toFixed(2)}) أقل من المبلغ المدفوع (${paid.toFixed(2)}). ألغِ الفاتورة أو سجّل ردًا للدفعة أولًا.`,
        },
        { status: 400 }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const stockWasMoved = invoice.status !== "DRAFT";

      // 1. Reverse old stock movements: return every productized line to stock.
      if (stockWasMoved) {
        for (const old of invoice.items) {
          if (old.productId && old.qty > 0) {
            await returnStockToInventory(tx, {
              ownerId: ctx.dbUser.id,
              userId: ctx.dbUser.id,
              productId: old.productId,
              qty: old.qty,
              note: `تعديل فاتورة ${invoice.invoiceNumber} — إرجاع`,
              reference: invoice.invoiceNumber,
            });
          }
        }
      }

      // 2. Replace items.
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
      await tx.invoiceItem.createMany({
        data: items.map((item) => ({
          invoiceId: id,
          productId: item.productId ?? null,
          name: item.name,
          qty: item.qty,
          unitPrice: item.unitPrice,
          discount: item.discount ?? 0,
          total: item.qty * item.unitPrice - (item.discount ?? 0),
          source: item.source ?? "SALE",
        })),
      });

      // 3. Re-apply stock movements for the new items.
      if (stockWasMoved) {
        for (const item of items) {
          if (item.productId && item.qty > 0) {
            await issueStockFromInventory(tx, {
              ownerId: ctx.dbUser.id,
              userId: ctx.dbUser.id,
              productId: item.productId,
              qty: item.qty,
              note: `تعديل فاتورة ${invoice.invoiceNumber}`,
              reference: invoice.invoiceNumber,
            });
          }
        }
      }

      // 4. Recompute invoice status from the new total + the (unchanged) paid.
      const newRemaining = newTotal - paid;
      const newStatus: InvoiceStatus =
        invoice.status === "DRAFT"
          ? "DRAFT"
          : newRemaining <= 0
          ? "PAID"
          : paid > 0
          ? "PARTIAL"
          : "ISSUED";

      // 5. Sync the linked debt(s). An invoice may be backed by several debts
      // (an installment plan), each possibly carrying recorded payments, so we
      // can't just rewrite debts[0] — we redistribute the new remaining across
      // every linked debt while preserving what's already been paid.
      const linked = invoice.debts;
      const paidOf = (d: (typeof linked)[number]) =>
        d.payments.reduce((s, p) => s + Number(p.amount), 0);
      const debtPaidTotal = linked.reduce((s, d) => s + paidOf(d), 0);
      const round2 = (n: number) => Math.round(n * 100) / 100;

      if (newRemaining <= 0) {
        // Total dropped to (or below) what's already paid — settle & void debts.
        if (linked.length > 0) {
          await tx.debt.updateMany({
            where: { invoiceId: id, isDeleted: false },
            data: { isDeleted: true, status: "PAID" },
          });
        }
      } else if (linked.length === 0) {
        if (invoice.status !== "DRAFT") {
          // Bill went up after editing — open a fresh debt row.
          await tx.debt.create({
            data: {
              ownerId: ctx.dbUser.id,
              customerId: invoice.customerId,
              invoiceId: invoice.id,
              amount: newRemaining,
              currency: invoice.currency,
              reason: `فاتورة ${invoice.invoiceNumber}`,
              status: paid > 0 ? "PARTIAL" : "PENDING",
              dueDate: debtDetails?.dueDate ? new Date(debtDetails.dueDate) : null,
              notes: debtDetails?.notes ?? null,
            },
          });
        }
      } else if (linked.length === 1 && debtPaidTotal === 0) {
        // Simple, common case: a single unpaid debt — also let the caller edit
        // its due date / notes.
        const only = linked[0];
        await tx.debt.update({
          where: { id: only.id },
          data: {
            amount: newRemaining,
            status: "PENDING",
            dueDate:
              debtDetails && "dueDate" in debtDetails
                ? debtDetails.dueDate
                  ? new Date(debtDetails.dueDate)
                  : null
                : only.dueDate,
            notes:
              debtDetails && "notes" in debtDetails
                ? debtDetails.notes ?? null
                : only.notes,
          },
        });
      } else {
        // Installments and/or recorded payments: spread the new remaining across
        // the debts (proportional to each one's current outstanding balance, the
        // increase landing on the last when everything is already paid), keeping
        // each debt's amount at least its paid portion. Invariant preserved:
        // Σ(amount) − Σ(payments) === invoice.remainingAmount.
        const ordered = [...linked].sort((a, b) => {
          const da = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
          const db = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
          if (da !== db) return da - db;
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        });
        const rems = ordered.map((d) => Math.max(0, Number(d.amount) - paidOf(d)));
        const totalRem = rems.reduce((s, r) => s + r, 0);

        let assigned = 0;
        for (let i = 0; i < ordered.length; i++) {
          const d = ordered[i];
          const paid_i = paidOf(d);
          const share =
            i === ordered.length - 1
              ? round2(newRemaining - assigned)
              : round2(totalRem > 0 ? newRemaining * (rems[i] / totalRem) : 0);
          if (i < ordered.length - 1) assigned += share;
          const amount = round2(paid_i + share);
          const status = paid_i >= amount ? "PAID" : paid_i > 0 ? "PARTIAL" : "PENDING";
          await tx.debt.update({ where: { id: d.id }, data: { amount, status } });
        }
      }

      // Repoint the invoice + every linked debt at the new customer.
      if (customerChanged && newCustomerId) {
        await tx.debt.updateMany({
          where: { invoiceId: id, isDeleted: false },
          data: { customerId: newCustomerId },
        });
      }

      return tx.invoice.update({
        where: { id },
        data: {
          subtotal,
          discountAmount: discAmt,
          discountPercent,
          taxPercent,
          taxAmount,
          deliveryFee: delivery,
          total: newTotal,
          remainingAmount: Math.max(0, newRemaining),
          status: newStatus,
          ...(notes !== undefined ? { notes } : {}),
          ...(customerChanged && newCustomerId ? { customerId: newCustomerId } : {}),
        },
        include: {
          customer: true,
          items: { include: { product: { select: { id: true, name: true, sku: true } } } },
          debts: { where: { isDeleted: false }, include: { payments: true } },
        },
      });
    });

    return ok(updated);
  } catch (e) {
    if (e instanceof InsufficientStockError) {
      return ok({ error: e.message }, { status: 409 });
    }
    console.error(e);
    return ok({ error: "خطأ في الخادم" }, { status: 500 });
  }
}

/**
 * Delete an invoice in any status.
 * - DRAFT: plain soft-delete (no stock or debt side-effects to reverse).
 * - ISSUED/PARTIAL/PAID: reverse stock movements and soft-delete linked
 *   debts, then soft-delete the invoice. Payments stay as a historical
 *   record on the (now soft-deleted) debts.
 * - CANCELLED: stock was already returned on cancel, debts already voided —
 *   just soft-delete.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const { id } = await params;
    const deleted = await prisma.$transaction((tx) =>
      softDeleteInvoice(tx, ctx.dbUser.id, ctx.dbUser.id, id)
    );
    if (!deleted) return ok({ error: "الفاتورة غير موجودة" }, { status: 404 });
    return ok({ success: true });
  } catch (e) {
    console.error(e);
    return ok({ error: "خطأ في الخادم" }, { status: 500 });
  }
}
