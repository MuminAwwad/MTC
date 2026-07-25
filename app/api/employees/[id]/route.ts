import { z } from "zod/v4";
import { ok } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { withAdmin, ApiError, parseBody } from "@/lib/api-handler";
import { invalidateUserCache } from "@/lib/auth";

const schema = z.object({
  name: z.string().min(1, "الاسم مطلوب").optional(),
  role: z.enum(["ADMIN", "STAFF"]).optional(),
  isActive: z.boolean().optional(),
});

// Employees are always scoped to `shopOwnerId: ctx.ownerId` so an admin can
// only ever touch members of their own shop, never an arbitrary user id.
export const PATCH = withAdmin<{ id: string }>(async (req, ctx, { params }) => {
  const { id } = await params;
  const { name, role, isActive } = await parseBody(req, schema);

  const employee = await prisma.user.findFirst({
    where: { id, shopOwnerId: ctx.ownerId, isDeleted: false },
  });
  if (!employee) throw new ApiError("الموظف غير موجود", 404);

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(role !== undefined ? { role } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    },
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
  });
  invalidateUserCache(updated.email);
  return ok(updated);
});

// Soft-delete only — the employee's User row is referenced by createdById
// across invoices/tickets/expenses/etc., so it's kept for history and just
// hidden + locked out (mirrors the isDeleted pattern used everywhere else).
export const DELETE = withAdmin<{ id: string }>(async (_req, ctx, { params }) => {
  const { id } = await params;

  const employee = await prisma.user.findFirst({
    where: { id, shopOwnerId: ctx.ownerId, isDeleted: false },
  });
  if (!employee) throw new ApiError("الموظف غير موجود", 404);

  await prisma.user.update({
    where: { id },
    data: { isDeleted: true, isActive: false },
  });
  invalidateUserCache(employee.email);
  return ok({ success: true });
});
