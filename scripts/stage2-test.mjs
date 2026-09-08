import assert from "node:assert/strict";

const baseUrl = process.env.BASE_URL ?? "http://localhost:4173";
const jsonHeaders = { "content-type": "application/json" };
const adminHeaders = { ...jsonHeaders, "x-admin-token": process.env.TEST_ADMIN_TOKEN };

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.json();
  return { response, body };
}
async function reset() { const result = await request("/api/admin/test-state", { method: "POST", headers: adminHeaders, body: JSON.stringify({ action: "reset" }) }); assert.equal(result.response.ok, true); }
async function setProduct(price, stock) { const result = await request("/api/admin/catalog", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ sku: "STEAM-TOPUP-500", price, stock }) }); assert.equal(result.response.ok, true, JSON.stringify(result.body)); }
async function create(token, orderId) { return request("/api/orders", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ client_token: token, order_id: orderId, sku: "STEAM-TOPUP-500" }) }); }
async function pay(orderId) { return request(`/api/orders/${orderId}/pay`, { method: "POST", headers: jsonHeaders, body: JSON.stringify({ status: "paid" }) }); }

await reset();
await setProduct(500, 1);
const stamp = Date.now();
const racers = await Promise.all([create(`last-a-${stamp}`, `ord_last_a_${stamp}`), create(`last-b-${stamp}`, `ord_last_b_${stamp}`)]);
assert.deepEqual(racers.map((item) => item.response.status).sort(), [201, 409]);
const winner = racers.find((item) => item.response.status === 201).body.order;
const loser = racers.find((item) => item.response.status === 409).body;
assert.equal(loser.code, "sold_out");
const winnerPaid = await pay(winner.id);
assert.equal(winnerPaid.response.ok, true);
assert.equal(winnerPaid.body.order.status, "delivered");
const winnerDiagnostics = await request(`/api/orders/${winner.id}`);
assert.equal(winnerDiagnostics.body.assignedKeys.length, 1);

await reset();
await setProduct(500, 2);
const priceId = `ord_price_${Date.now()}`;
const priced = await create(`price-${Date.now()}`, priceId);
assert.equal(priced.body.order.amount, 500);
await setProduct(650, 1);
const quote = await request(`/api/orders/${priceId}/quote`);
assert.equal(quote.body.quote.changed, true);
assert.equal(quote.body.quote.amount, 650);
const priceGuard = await pay(priceId);
assert.equal(priceGuard.response.status, 409);
assert.equal(priceGuard.body.code, "price_changed");
assert.equal(priceGuard.body.order.payment_status, null);
const acceptedPrice = await pay(priceId);
assert.equal(acceptedPrice.body.order.status, "delivered");
assert.equal(acceptedPrice.body.order.amount, 650);

await reset();
await setProduct(500, 1);
const expiryId = `ord_expiry_${Date.now()}`;
await create(`expiry-${Date.now()}`, expiryId);
await new Promise((resolve) => setTimeout(resolve, 1200));
await request("/api/catalog");
const expired = await request(`/api/orders/${expiryId}`);
assert.equal(expired.body.order.status, "reservation_expired");
const afterExpiry = await request("/api/catalog");
assert.equal(afterExpiry.body.products.find((item) => item.sku === "STEAM-TOPUP-500").available, 1);
const afterExpiryOrder = await create(`after-expiry-${Date.now()}`, `ord_after_expiry_${Date.now()}`);
assert.equal(afterExpiryOrder.response.status, 201);
const afterExpiryPaid = await pay(afterExpiryOrder.body.order.id);
assert.equal(afterExpiryPaid.body.order.status, "delivered");

await reset();
await setProduct(500, 2);
const replayToken = `replay-${Date.now()}`;
const replayIds = await Promise.all(Array.from({ length: 20 }, (_, index) => create(replayToken, `ord_replay_${Date.now()}_${index}`)));
assert.equal(new Set(replayIds.map((item) => item.body.order.id)).size, 1);
const replayOrder = replayIds[0].body.order;
const repeatedPayments = await Promise.all(Array.from({ length: 20 }, () => pay(replayOrder.id)));
assert.equal(repeatedPayments.every((item) => item.response.ok), true);
const replayDiagnostics = await request(`/api/orders/${replayOrder.id}`);
assert.equal(replayDiagnostics.body.order.status, "delivered");
assert.equal(replayDiagnostics.body.assignedKeys.length, 1);
assert.equal(replayDiagnostics.body.events.length, 1);

const search = await request("/api/search?q=steam&type=topup&max_price=1000");
assert.equal(search.response.ok, true);
assert.equal(search.body.total > 100, true);
assert.equal(search.body.offers.every((offer) => offer.name.toLowerCase().includes("steam") && offer.price <= 1000), true);

console.log("✓ последнюю единицу получает только один покупатель");
console.log("✓ новая цена показана и подтверждается до оплаты");
console.log("✓ истёкшая бронь возвращает товар в продажу");
console.log("✓ 20 повторов создания и оплаты не дают дублей");
console.log("✓ поиск фильтрует каталог из 2400 предложений");
