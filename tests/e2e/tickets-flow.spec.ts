import { test, expect, type APIRequestContext } from "@playwright/test";
import { AUTH_FILE, tag, uniquePhone, cleanupCustomer, cleanupProduct, hardDelete } from "./helpers";

test.use({ storageState: AUTH_FILE });

async function stockOf(request: APIRequestContext, productId: string): Promise<number> {
  const list = await (await request.get("/api/products?all=true")).json();
  return list.find((p: { id: string }) => p.id === productId)?.stockQty ?? -1;
}

test.describe("Repair ticket → parts → invoice flow", () => {
  test("ticket part decrements stock; issuing the repair invoice delivers the ticket", async ({ request }) => {
    test.setTimeout(120_000);
    const label = tag("TKTF");
    let customerId = "";
    let productId = "";
    let ticketId = "";
    let invoiceId = "";
    try {
      customerId = (await (await request.post("/api/customers", { data: { name: `${label}-c`, phone: uniquePhone() } })).json()).id;
      productId = (await (await request.post("/api/products", { data: { name: `${label}-p`, costPrice: 30, sellPrice: 100, stockQty: 10 } })).json()).id;

      const t = await request.post("/api/tickets", {
        data: { customerId, deviceType: "LAPTOP", problemDescription: `${label} شاشة مكسورة`, estimatedCost: 150 },
      });
      expect(t.status(), await t.text()).toBe(201);
      ticketId = (await t.json()).id;

      // add a part from inventory → stock 10 → 9
      const part = await request.post(`/api/tickets/${ticketId}/parts`, {
        data: { productId, name: `${label}-p`, qty: 1, unitCost: 30 },
      });
      expect(part.status(), await part.text()).toBe(201);
      expect((await part.json()).productId).toBe(productId);
      expect(await stockOf(request, productId)).toBe(9);

      // issue a repair invoice for the ticket (part line + labour line), paid in full
      const inv = await request.post("/api/invoices", {
        data: {
          customerId,
          ticketId,
          items: [
            { productId, name: `${label}-p`, qty: 1, unitPrice: 100, source: "TICKET_PART" },
            { name: `${label}-labor`, qty: 1, unitPrice: 50, source: "TICKET_LABOR" },
          ],
          status: "ISSUED",
          paidAmount: 150,
        },
      });
      expect(inv.status(), await inv.text()).toBe(201);
      const invBody = await inv.json();
      invoiceId = invBody.id;
      expect(invBody.status).toBe("PAID");
      expect(invBody.ticketId).toBe(ticketId);
      // the productized line decremented stock again 9 → 8
      expect(await stockOf(request, productId)).toBe(8);

      // ticket is now delivered and points back at the invoice
      const ticket = await (await request.get(`/api/tickets/${ticketId}`)).json();
      expect(ticket.status).toBe("DELIVERED");
      expect(ticket.invoice?.id).toBe(invoiceId);
      expect(ticket.parts?.length).toBe(1);
      expect(ticket.parts[0].productId).toBe(productId);
    } finally {
      // delivered tickets can't be soft-deleted; hard-delete (nulls invoice.ticketId)
      if (ticketId) await hardDelete(request, "ticket", ticketId);
      if (invoiceId) await hardDelete(request, "invoice", invoiceId);
      if (productId) await cleanupProduct(request, productId);
      if (customerId) await cleanupCustomer(request, customerId);
    }
  });
});
