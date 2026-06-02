import { test, expect } from "@playwright/test";
import { AUTH_FILE, tag, uniquePhone } from "./helpers";

test.use({ storageState: AUTH_FILE });

test("repro: status-only PATCH on ticket", async ({ request }) => {
  test.setTimeout(60_000);

  const customer = await request
    .post("/api/customers", {
      data: { name: `${tag("REPRO")}-c`, phone: uniquePhone() },
    })
    .then((r) => r.json());

  const ticket = await request
    .post("/api/tickets", {
      data: {
        customerId: customer.id,
        deviceType: "MOBILE",
        problemDescription: "test",
      },
    })
    .then((r) => r.json());

  console.log("created ticket:", ticket.id, "status:", ticket.status);

  // Step A: full-form PATCH (mirror what the edit page sends)
  const formPatch = await request.patch(`/api/tickets/${ticket.id}`, {
    data: {
      customerId: customer.id,
      deviceType: "MOBILE",
      deviceBrand: "NewBrand",
      deviceModel: "OldModel",
      serialNumber: "",
      problemDescription: "updated problem",
      priority: "HIGH",
      estimatedCost: null,
      finalCost: null,
      depositPaid: 0,
      estimatedDelivery: null,
      customerNotes: "",
      technicianNotes: "",
      diagnosis: "",
      solution: "",
    },
  });
  console.log("form PATCH:", formPatch.status(), await formPatch.text());

  // Status-only PATCH — RECEIVED → DIAGNOSING
  const patchRes = await request.patch(`/api/tickets/${ticket.id}`, {
    data: { status: "DIAGNOSING" },
  });
  const patchText = await patchRes.text();
  console.log("PATCH status:", patchRes.status(), "body:", patchText);
  expect(patchRes.status()).toBe(200);

  // cleanup
  await request.patch(`/api/tickets/${ticket.id}`, { data: { status: "CANCELLED" } });
  await request.delete(`/api/tickets/${ticket.id}`);
  await request.delete(`/api/customers/${customer.id}`);
});
