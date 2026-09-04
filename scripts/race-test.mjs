import assert from "node:assert/strict";

const baseUrl = process.env.BASE_URL ?? "http://localhost:4173";
const jsonHeaders = { "content-type": "application/json" };
const testAdminToken = process.env.TEST_ADMIN_TOKEN;
if (!testAdminToken) throw new Error("TEST_ADMIN_TOKEN is required");

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.json();
  return { response, body };
}

async function reset(action = "reset") {
  const { response, body } = await request("/api/admin/test-state", { method: "POST", headers: { ...jsonHeaders, "x-admin-token": testAdminToken }, body: JSON.stringify({ action }) });
  assert.equal(response.ok, true, JSON.stringify(body));
}

async function createOrder({ token, orderId, promoCode, sku = "STEAM-TOPUP-500" }) {
  return request("/api/orders", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ client_token: token, order_id: orderId, sku, promo_code: promoCode }) });
}

async function waitForOrder(orderId, expectedStatus, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await request(`/api/orders/${orderId}`);
    if (result.body.order?.status === expectedStatus) return result;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return request(`/api/orders/${orderId}`);
}

await reset();

const storefrontSkus = ["STEAM-TOPUP-500", "KEY-CS2-PRIME", "KEY-GTA5", "KEY-EFT", "SUB-DISCORD-1M"];
for (const [index, sku] of storefrontSkus.entries()) {
  const cardOrderId = `ord_card_${index}_${Date.now()}`;
  const cardOrder = await createOrder({ token: `token_${cardOrderId}`, orderId: cardOrderId, sku });
  assert.equal(cardOrder.response.status, 201);
  const paidCard = await request(`/api/orders/${cardOrderId}/pay`, { method: "POST", headers: jsonHeaders, body: JSON.stringify({ status: "paid" }) });
  assert.equal(paidCard.body.order.status, "delivered", `${sku} должен выдаваться с витрины`);
}

await reset();

const orderId = `ord_race_${Date.now()}`;
const created = await createOrder({ token: `token_${orderId}`, orderId });
assert.equal(created.response.status, 201);

const event = (index, eventId = `evt_race_${index}_${Date.now()}`) => ({ event_id: eventId, order_id: orderId, status: "paid", amount: 500, currency: "RUB", created_at: new Date().toISOString() });
const webhookResults = await Promise.all(Array.from({ length: 50 }, (_, index) => request("/api/webhooks/payment", { method: "POST", headers: jsonHeaders, body: JSON.stringify(event(index)) })));
assert.equal(webhookResults.every(({ response }) => response.ok), true);
assert.equal(webhookResults.every(({ body }) => ["queued", "duplicate"].includes(body.result)), true);

const diagnostics = await waitForOrder(orderId, "delivered");
assert.equal(diagnostics.body.order.status, "delivered");
assert.equal(diagnostics.body.assignedKeys.length, 1, "ровно один ключ должен быть израсходован");

const duplicateEvent = event("duplicate", `evt_duplicate_${Date.now()}`);
await Promise.all(Array.from({ length: 20 }, () => request("/api/webhooks/payment", { method: "POST", headers: jsonHeaders, body: JSON.stringify(duplicateEvent) })));
const afterDuplicate = await request(`/api/orders/${orderId}`);
assert.equal(afterDuplicate.body.assignedKeys.length, 1);

const earlyOrderId = `ord_early_${Date.now()}`;
await request("/api/webhooks/payment", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ ...event("early"), event_id: `evt_early_${Date.now()}`, order_id: earlyOrderId }) });
await createOrder({ token: `token_${earlyOrderId}`, orderId: earlyOrderId });
const earlyDiagnostics = await request(`/api/orders/${earlyOrderId}`);
assert.equal(earlyDiagnostics.body.order.status, "delivered", "ранний вебхук должен быть обработан после создания заказа");

await reset();
const promoResults = await Promise.all(Array.from({ length: 10 }, (_, index) => createOrder({ token: `promo_${Date.now()}_${index}`, orderId: `ord_promo_${Date.now()}_${index}`, promoCode: "LIMIT3" })));
assert.equal(promoResults.filter(({ response }) => response.status === 201).length, 3, "LIMIT3 нельзя применить больше трёх раз");

await reset();
await reset("drain");
const recoveryId = `ord_recovery_${Date.now()}`;
await createOrder({ token: `token_${recoveryId}`, orderId: recoveryId });
await request(`/api/orders/${recoveryId}/pay`, { method: "POST", headers: jsonHeaders, body: JSON.stringify({ status: "paid" }) });
let recovery = await request(`/api/orders/${recoveryId}`);
assert.equal(recovery.body.order.status, "out_of_stock");
await request("/api/admin/inventory", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ codes: [`RECOVER-${Date.now()}-KEY`], provider: "A" }) });
await request(`/api/admin/orders/${recoveryId}/retry`, { method: "POST" });
recovery = await request(`/api/orders/${recoveryId}`);
assert.equal(recovery.body.order.status, "delivered");
assert.equal(recovery.body.assignedKeys.length, 1);

console.log("✓ 50 параллельных вебхуков: одна выдача");
console.log("✓ все пять карточек: создание, оплата и выдача");
console.log("✓ повтор event_id: без изменений");
console.log("✓ ранний вебхук: восстановлен после создания заказа");
console.log("✓ LIMIT3: не более трёх применений");
console.log("✓ пустой пул: out_of_stock → безопасная повторная выдача");
