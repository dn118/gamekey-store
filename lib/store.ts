import { env } from "cloudflare:workers";
import { CATALOG, KEY_POOL, PROMOS } from "./catalog";

export type OrderStatus =
  | "created"
  | "paid"
  | "delivering"
  | "delivered"
  | "payment_failed"
  | "out_of_stock"
  | "delivery_failed";

export type StoreOrder = {
  id: string;
  client_token: string;
  sku: string;
  amount: number;
  currency: string;
  status: OrderStatus;
  payment_status: "paid" | "failed" | null;
  promo_code: string | null;
  discount_amount: number;
  delivery_request_id: string | null;
  provider: string | null;
  code: string | null;
  created_at: string;
  updated_at: string;
};

export type PaymentEventInput = {
  event_id: string;
  order_id: string;
  status: "paid" | "failed";
  amount: number;
  currency: string;
  created_at: string;
};

function db() {
  if (!env.DB) throw new Error("D1 database binding is unavailable");
  return env.DB;
}

function now() {
  return new Date().toISOString();
}

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;
}

function clampInt(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : fallback;
}

export async function ensureSeedData() {
  const database = db();
  const existing = (await database.prepare(`SELECT
    (SELECT COUNT(*) FROM products) AS products,
    (SELECT COUNT(*) FROM promo_codes) AS promos,
    (SELECT COUNT(*) FROM provider_settings) AS providers,
    EXISTS(SELECT 1 FROM inventory_keys WHERE code = ?) AS current_inventory`).bind(KEY_POOL[0].code).first()) as {
      products: number; promos: number; providers: number; current_inventory: number;
    } | null;
  if (existing && existing.products >= CATALOG.length && existing.promos >= PROMOS.length && existing.providers >= 2 && existing.current_inventory === 1) return;

  const statements = [
    ...CATALOG.map((product) =>
      database
        .prepare("INSERT OR IGNORE INTO products (sku, name, type, price, currency) VALUES (?, ?, ?, ?, ?)")
        .bind(product.sku, product.name, product.type, product.price, product.currency),
    ),
    ...KEY_POOL.map(({ code, sku }, index) =>
      database
        .prepare("INSERT OR IGNORE INTO inventory_keys (code, sku, provider) VALUES (?, ?, ?)")
        .bind(code, sku, index % 2 === 0 ? "A" : "B"),
    ),
    ...PROMOS.map((promo) =>
      database
        .prepare("INSERT OR IGNORE INTO promo_codes (code, type, value, currency, max_uses) VALUES (?, ?, ?, ?, ?)")
        .bind(promo.code, promo.type, promo.value, promo.currency, promo.maxUses),
    ),
    database.prepare("INSERT OR IGNORE INTO provider_settings (provider, failure_rate, timeout_rate, delay_ms) VALUES ('A', 0, 0, 0)"),
    database.prepare("INSERT OR IGNORE INTO provider_settings (provider, failure_rate, timeout_rate, delay_ms) VALUES ('B', 0, 0, 0)"),
  ];
  await database.batch(statements);
}

export async function listProducts() {
  await ensureSeedData();
  const result = await db().prepare("SELECT sku, name, type, price, currency FROM products ORDER BY rowid").all();
  return result.results;
}

export async function getOrder(orderId: string) {
  return (await db().prepare("SELECT * FROM orders WHERE id = ?").bind(orderId).first()) as StoreOrder | null;
}

export async function createOrder(input: {
  clientToken: string;
  sku: string;
  promoCode?: string;
  orderId?: string;
}) {
  await ensureSeedData();
  const database = db();
  const clientToken = input.clientToken.trim();
  if (!clientToken || clientToken.length > 120) throw new Error("Некорректный idempotency key");

  const existing = (await database.prepare("SELECT * FROM orders WHERE client_token = ?").bind(clientToken).first()) as StoreOrder | null;
  if (existing) return { order: existing, replayed: true };

  const product = (await database
    .prepare("SELECT sku, price, currency FROM products WHERE sku = ?")
    .bind(input.sku)
    .first()) as { sku: string; price: number; currency: string } | null;
  if (!product) throw new Error("Товар не найден");

  let discount = 0;
  let appliedPromo: string | null = null;
  if (input.promoCode?.trim()) {
    const code = input.promoCode.trim().toUpperCase();
    const promo = (await database
      .prepare("SELECT code, type, value, currency, max_uses FROM promo_codes WHERE code = ?")
      .bind(code)
      .first()) as { code: string; type: string; value: number; currency: string | null; max_uses: number } | null;
    if (!promo || (promo.currency && promo.currency !== product.currency)) throw new Error("Промокод недействителен");
    discount = promo.type === "percent" ? Math.floor((product.price * promo.value) / 100) : Math.min(product.price, promo.value);

    const reservation = await database
      .prepare(`INSERT INTO promo_redemptions (client_token, promo_code, discount_amount, created_at)
        SELECT ?, ?, ?, ?
        WHERE (SELECT COUNT(*) FROM promo_redemptions WHERE promo_code = ?) < ?
        ON CONFLICT(client_token) DO NOTHING
        RETURNING client_token`)
      .bind(clientToken, promo.code, discount, now(), promo.code, promo.max_uses)
      .first();
    const existingReservation = reservation ?? (await database.prepare("SELECT client_token FROM promo_redemptions WHERE client_token = ? AND promo_code = ?").bind(clientToken, promo.code).first());
    if (!existingReservation) throw new Error("Лимит использований промокода исчерпан");
    appliedPromo = promo.code;
  }

  const orderId = input.orderId?.trim() || id("ord");
  if (!/^ord_[A-Za-z0-9_-]{3,80}$/.test(orderId)) throw new Error("Некорректный order_id");
  const timestamp = now();
  const amount = Math.max(0, product.price - discount);
  await database
    .prepare(`INSERT OR IGNORE INTO orders
      (id, client_token, sku, amount, currency, status, promo_code, discount_amount, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'created', ?, ?, ?, ?)`)
    .bind(orderId, clientToken, product.sku, amount, product.currency, appliedPromo, discount, timestamp, timestamp)
    .run();

  const order = (await database.prepare("SELECT * FROM orders WHERE client_token = ?").bind(clientToken).first()) as StoreOrder | null;
  if (!order) throw new Error("Не удалось создать заказ");
  if (appliedPromo) {
    await database.prepare("UPDATE promo_redemptions SET order_id = ? WHERE client_token = ? AND order_id IS NULL").bind(order.id, clientToken).run();
  }
  await processPendingPaymentEvents(order.id);
  return { order: (await getOrder(order.id))!, replayed: false };
}

export async function issueFromProvider(provider: "A" | "B", requestId: string, orderId: string, sku: string) {
  const database = db();
  const timestamp = now();
  await database
    .prepare(`INSERT OR IGNORE INTO delivery_attempts
      (request_id, order_id, provider, status, created_at, updated_at)
      VALUES (?, ?, ?, 'pending', ?, ?)`)
    .bind(requestId, orderId, provider, timestamp, timestamp)
    .run();

  const alreadyIssued = (await database
    .prepare("SELECT code FROM inventory_keys WHERE assigned_request_id = ?")
    .bind(requestId)
    .first()) as { code: string } | null;
  if (alreadyIssued) return { kind: "ok" as const, code: alreadyIssued.code };

  const settings = (await database
    .prepare("SELECT failure_rate, timeout_rate, delay_ms FROM provider_settings WHERE provider = ?")
    .bind(provider)
    .first()) as { failure_rate: number; timeout_rate: number; delay_ms: number } | null;
  const roll = Math.floor(Math.random() * 100);
  if (roll < clampInt(settings?.failure_rate)) {
    await database.prepare("UPDATE delivery_attempts SET status = 'failed', reason = 'provider_5xx', updated_at = ? WHERE request_id = ?").bind(now(), requestId).run();
    return { kind: "failed" as const, reason: "provider_5xx" };
  }

  let claimed: { code: string } | null = null;
  try {
    claimed = (await database
      .prepare(`UPDATE inventory_keys
        SET assigned_order_id = ?, assigned_request_id = ?, assigned_at = ?
        WHERE code = (
          SELECT code FROM inventory_keys
          WHERE sku = ? AND provider = ? AND assigned_request_id IS NULL
          ORDER BY code LIMIT 1
        ) AND assigned_request_id IS NULL
        RETURNING code`)
      .bind(orderId, requestId, now(), sku, provider)
      .first()) as { code: string } | null;
  } catch {
    claimed = (await database.prepare("SELECT code FROM inventory_keys WHERE assigned_request_id = ?").bind(requestId).first()) as { code: string } | null;
  }
  if (!claimed) {
    await database.prepare("UPDATE delivery_attempts SET status = 'out_of_stock', reason = 'out_of_stock', updated_at = ? WHERE request_id = ?").bind(now(), requestId).run();
    return { kind: "out_of_stock" as const, reason: "out_of_stock" };
  }

  await database
    .prepare("UPDATE delivery_attempts SET status = 'issued', code = ?, reason = NULL, updated_at = ? WHERE request_id = ?")
    .bind(claimed.code, now(), requestId)
    .run();

  const delayMs = Math.min(clampInt(settings?.delay_ms), 1500);
  if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
  if (roll < clampInt(settings?.failure_rate) + clampInt(settings?.timeout_rate)) {
    return { kind: "timeout" as const, reason: "timeout_after_issue" };
  }
  return { kind: "ok" as const, code: claimed.code };
}

export async function issueOrder(orderId: string, recovery = false) {
  const database = db();
  const requestId = id(`req_${orderId}`);
  const allowed = recovery ? "('paid','out_of_stock','delivery_failed','delivering')" : "('paid','out_of_stock','delivery_failed')";
  const claimed = (await database
    .prepare(`UPDATE orders SET status = 'delivering', delivery_request_id = COALESCE(delivery_request_id, ?), updated_at = ?
      WHERE id = ? AND code IS NULL AND status IN ${allowed}
      RETURNING *`)
    .bind(requestId, now(), orderId)
    .first()) as StoreOrder | null;
  if (!claimed) return getOrder(orderId);

  const baseRequestId = claimed.delivery_request_id!;
  let result = await issueFromProvider("A", `${baseRequestId}:A`, claimed.id, claimed.sku);
  if (result.kind === "timeout") result = await issueFromProvider("A", `${baseRequestId}:A`, claimed.id, claimed.sku);
  let provider: "A" | "B" = "A";
  if (result.kind === "failed" || result.kind === "out_of_stock") {
    provider = "B";
    result = await issueFromProvider("B", `${baseRequestId}:B`, claimed.id, claimed.sku);
    if (result.kind === "timeout") result = await issueFromProvider("B", `${baseRequestId}:B`, claimed.id, claimed.sku);
  }

  if (result.kind === "ok") {
    await database
      .prepare("UPDATE orders SET status = 'delivered', provider = ?, code = ?, updated_at = ? WHERE id = ? AND code IS NULL")
      .bind(provider, result.code, now(), claimed.id)
      .run();
  } else {
    const status = result.kind === "out_of_stock" ? "out_of_stock" : "delivery_failed";
    await database.prepare("UPDATE orders SET status = ?, updated_at = ? WHERE id = ? AND code IS NULL").bind(status, now(), claimed.id).run();
  }
  return getOrder(claimed.id);
}

export async function storePaymentEvent(input: PaymentEventInput) {
  const database = db();
  if (!input.event_id || !input.order_id || !["paid", "failed"].includes(input.status)) throw new Error("Некорректный вебхук");
  if (!Number.isInteger(input.amount) || input.amount < 0 || !input.currency || !input.created_at) throw new Error("Некорректный вебхук");
  const inserted = await database
    .prepare(`INSERT OR IGNORE INTO payment_events
      (event_id, order_id, status, amount, currency, event_created_at, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(input.event_id, input.order_id, input.status, input.amount, input.currency, input.created_at, now())
    .run();
  return { accepted: true, duplicate: (inserted.meta?.changes ?? 0) === 0 };
}

export async function acceptPaymentEvent(input: PaymentEventInput) {
  const stored = await storePaymentEvent(input);
  const result = await processPaymentEvent(input.event_id);
  return { ...stored, duplicate: stored.duplicate || result === "duplicate", result };
}

export async function processPaymentEvent(eventId: string) {
  const database = db();
  const event = (await database.prepare("SELECT * FROM payment_events WHERE event_id = ?").bind(eventId).first()) as (PaymentEventInput & { processed_at: string | null; event_created_at: string }) | null;
  if (!event) return "missing";
  if (event.processed_at) return "duplicate";
  const order = await getOrder(event.order_id);
  if (!order) return "pending_order";
  if (event.amount !== order.amount || event.currency !== order.currency) {
    await database.prepare("UPDATE payment_events SET processed_at = ?, processing_result = 'amount_mismatch' WHERE event_id = ? AND processed_at IS NULL").bind(now(), eventId).run();
    return "amount_mismatch";
  }

  if (event.status === "paid") {
    await database
      .prepare(`UPDATE orders SET payment_status = 'paid', payment_event_at = ?,
        status = CASE WHEN status IN ('created','payment_failed') THEN 'paid' ELSE status END,
        updated_at = ? WHERE id = ? AND payment_status IS NOT 'paid'`)
      .bind(event.event_created_at, now(), order.id)
      .run();
  } else {
    await database
      .prepare(`UPDATE orders SET payment_status = 'failed', payment_event_at = ?, status = 'payment_failed', updated_at = ?
        WHERE id = ? AND payment_status IS NOT 'paid' AND status IN ('created','payment_failed')
        AND (payment_event_at IS NULL OR payment_event_at <= ?)`)
      .bind(event.event_created_at, now(), order.id, event.event_created_at)
      .run();
  }
  await database.prepare("UPDATE payment_events SET processed_at = ?, processing_result = 'processed' WHERE event_id = ? AND processed_at IS NULL").bind(now(), eventId).run();
  const refreshed = await getOrder(order.id);
  if (refreshed?.payment_status === "paid" && refreshed.code === null) await issueOrder(order.id);
  return "processed";
}

export async function processPendingPaymentEvents(orderId: string) {
  const rows = await db()
    .prepare("SELECT event_id FROM payment_events WHERE order_id = ? AND processed_at IS NULL ORDER BY event_created_at, event_id")
    .bind(orderId)
    .all();
  for (const row of rows.results as { event_id: string }[]) await processPaymentEvent(row.event_id);
}

export async function listRecoveryOrders() {
  const result = await db()
    .prepare("SELECT * FROM orders WHERE status IN ('out_of_stock','delivery_failed','delivering') AND payment_status = 'paid' ORDER BY updated_at DESC")
    .all();
  return result.results as StoreOrder[];
}

export async function addInventory(codes: string[], provider: "A" | "B" = "A") {
  const clean = [...new Set(codes.map((code) => code.trim().toUpperCase()).filter(Boolean))].slice(0, 100);
  if (!clean.length) throw new Error("Добавьте хотя бы один ключ");
  await db().batch(clean.map((code) => db().prepare("INSERT OR IGNORE INTO inventory_keys (code, sku, provider) VALUES (?, 'STEAM-TOPUP-500', ?)").bind(code, provider)));
  return { added: clean.length };
}

export async function setProviderSettings(provider: "A" | "B", input: { failureRate?: number; timeoutRate?: number; delayMs?: number }) {
  await db()
    .prepare("UPDATE provider_settings SET failure_rate = ?, timeout_rate = ?, delay_ms = ? WHERE provider = ?")
    .bind(Math.min(clampInt(input.failureRate), 100), Math.min(clampInt(input.timeoutRate), 100), Math.min(clampInt(input.delayMs), 1500), provider)
    .run();
}

export async function getDiagnostics(orderId: string) {
  const database = db();
  const order = await getOrder(orderId);
  const events = await database.prepare("SELECT * FROM payment_events WHERE order_id = ? ORDER BY received_at").bind(orderId).all();
  const attempts = await database.prepare("SELECT * FROM delivery_attempts WHERE order_id = ? ORDER BY created_at").bind(orderId).all();
  const assignedKeys = await database.prepare("SELECT code, provider, assigned_request_id FROM inventory_keys WHERE assigned_order_id = ?").bind(orderId).all();
  return { order, events: events.results, attempts: attempts.results, assignedKeys: assignedKeys.results };
}

export async function setTestState(action: "reset" | "drain") {
  const database = db();
  if (action === "drain") {
    await database
      .prepare("UPDATE inventory_keys SET assigned_order_id = 'drain:' || code, assigned_request_id = 'drain:' || code, assigned_at = ? WHERE assigned_request_id IS NULL")
      .bind(now())
      .run();
    return;
  }
  await database.batch([
    database.prepare("DELETE FROM payment_events"),
    database.prepare("DELETE FROM delivery_attempts"),
    database.prepare("DELETE FROM promo_redemptions"),
    database.prepare("DELETE FROM orders"),
    database.prepare("UPDATE inventory_keys SET assigned_order_id = NULL, assigned_request_id = NULL, assigned_at = NULL"),
    database.prepare("UPDATE provider_settings SET failure_rate = 0, timeout_rate = 0, delay_ms = 0"),
  ]);
}
