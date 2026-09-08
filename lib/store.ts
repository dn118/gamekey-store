import { env } from "cloudflare:workers";
import { CATALOG, KEY_POOL, PROMOS } from "./catalog";

export type OrderStatus =
  | "created"
  | "paid"
  | "delivering"
  | "delivered"
  | "payment_failed"
  | "reservation_expired"
  | "out_of_stock"
  | "delivery_failed";

export type StoreOrder = {
  id: string;
  client_token: string;
  sku: string;
  amount: number;
  unit_price: number;
  currency: string;
  status: OrderStatus;
  payment_status: "paid" | "failed" | null;
  promo_code: string | null;
  discount_amount: number;
  reservation_expires_at: string | null;
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

function reservationTtlMs() {
  const configured = Number((env as unknown as { RESERVATION_TTL_SECONDS?: string }).RESERVATION_TTL_SECONDS);
  return (Number.isFinite(configured) && configured > 0 ? Math.min(configured, 600) : 180) * 1000;
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
    (SELECT COUNT(*) FROM provider_settings) AS providers`).first()) as {
      products: number; promos: number; providers: number;
    } | null;
  if (existing && existing.products >= CATALOG.length && existing.promos >= PROMOS.length && existing.providers >= 2) return;

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

export async function releaseExpiredReservations() {
  const database = db();
  const timestamp = now();
  await database.batch([
    database.prepare("UPDATE reservations SET status = 'expired', updated_at = ? WHERE status = 'active' AND expires_at <= ?").bind(timestamp, timestamp),
    database.prepare(`UPDATE inventory_keys SET reserved_order_id = NULL, reserved_until = NULL
      WHERE reserved_order_id IN (SELECT order_id FROM reservations WHERE status IN ('expired','released','fulfilled'))`),
    database.prepare("UPDATE reservations SET inventory_code = NULL, updated_at = ? WHERE status IN ('expired','released') AND inventory_code IS NOT NULL").bind(timestamp),
    database.prepare(`UPDATE orders SET status = 'reservation_expired', updated_at = ?
      WHERE status = 'created' AND id IN (SELECT order_id FROM reservations WHERE status = 'expired')`).bind(timestamp),
  ]);
}

export async function listProducts() {
  await ensureSeedData();
  await releaseExpiredReservations();
  const result = await db().prepare(`SELECT p.sku, p.name, p.type, p.price, p.currency, p.updated_at,
    (SELECT COUNT(*) FROM inventory_keys k WHERE k.sku = p.sku AND k.assigned_order_id IS NULL AND k.reserved_order_id IS NULL) AS free_units
    FROM products p ORDER BY p.rowid`).all();
  return (result.results as Array<Record<string, unknown> & { free_units: number }>).map((product) => ({
    ...product,
    available: Math.max(0, Number(product.free_units)),
  }));
}

export async function getOrder(orderId: string) {
  await releaseExpiredReservations();
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

  const requestedOrderId = input.orderId?.trim() || id("ord");
  if (!/^ord_[A-Za-z0-9_-]{3,80}$/.test(requestedOrderId)) throw new Error("Некорректный order_id");

  let discount = 0;
  let appliedPromo: string | null = null;
  let selectedPromo: { code: string; type: string; value: number; currency: string | null; max_uses: number } | null = null;
  if (input.promoCode?.trim()) {
    const code = input.promoCode.trim().toUpperCase();
    const promo = (await database
      .prepare("SELECT code, type, value, currency, max_uses FROM promo_codes WHERE code = ?")
      .bind(code)
      .first()) as { code: string; type: string; value: number; currency: string | null; max_uses: number } | null;
    if (!promo || (promo.currency && promo.currency !== product.currency)) throw new Error("Промокод недействителен");
    discount = promo.type === "percent" ? Math.floor((product.price * promo.value) / 100) : Math.min(product.price, promo.value);
    selectedPromo = promo;
  }

  await releaseExpiredReservations();
  const timestamp = now();
  const expiresAt = new Date(Date.now() + reservationTtlMs()).toISOString();
  await database.prepare(`INSERT OR IGNORE INTO reservations
      (order_id, client_token, sku, status, expires_at, created_at, updated_at)
      VALUES (?, ?, ?, 'active', ?, ?, ?)`)
    .bind(requestedOrderId, clientToken, product.sku, expiresAt, timestamp, timestamp).run();
  let reservation = await database.prepare("SELECT order_id, expires_at, inventory_code FROM reservations WHERE client_token = ? AND status = 'active'").bind(clientToken).first() as { order_id: string; expires_at: string; inventory_code: string | null } | null;
  if (!reservation) throw new Error("Товар только что раскупили. Вернитесь к товару или выберите другое предложение.");
  if (!reservation.inventory_code) {
    let claimed: { code: string } | null = null;
    try {
      claimed = await database.prepare(`UPDATE inventory_keys SET reserved_order_id = ?, reserved_until = ?
        WHERE code = (SELECT code FROM inventory_keys WHERE sku = ? AND assigned_order_id IS NULL AND reserved_order_id IS NULL ORDER BY code LIMIT 1)
        AND assigned_order_id IS NULL AND reserved_order_id IS NULL RETURNING code`)
        .bind(reservation.order_id, reservation.expires_at, product.sku).first() as { code: string } | null;
    } catch {
      claimed = await database.prepare("SELECT code FROM inventory_keys WHERE reserved_order_id = ?").bind(reservation.order_id).first() as { code: string } | null;
    }
    if (claimed) await database.prepare("UPDATE reservations SET inventory_code = ?, updated_at = ? WHERE order_id = ? AND inventory_code IS NULL").bind(claimed.code, now(), reservation.order_id).run();
    reservation = await database.prepare("SELECT order_id, expires_at, inventory_code FROM reservations WHERE client_token = ? AND status = 'active'").bind(clientToken).first() as typeof reservation;
  }
  if (!reservation?.inventory_code) {
    await database.prepare("UPDATE reservations SET status = 'released', updated_at = ? WHERE client_token = ? AND status = 'active'").bind(now(), clientToken).run();
    throw new Error("Товар только что раскупили. Вернитесь к товару или выберите другое предложение.");
  }

  if (selectedPromo) {
    const promoReservation = await database
      .prepare(`INSERT INTO promo_redemptions (client_token, promo_code, discount_amount, created_at)
        SELECT ?, ?, ?, ?
        WHERE (SELECT COUNT(*) FROM promo_redemptions WHERE promo_code = ?) < ?
        ON CONFLICT(client_token) DO NOTHING
        RETURNING client_token`)
      .bind(clientToken, selectedPromo.code, discount, now(), selectedPromo.code, selectedPromo.max_uses)
      .first();
    const existingReservation = promoReservation ?? (await database.prepare("SELECT client_token FROM promo_redemptions WHERE client_token = ? AND promo_code = ?").bind(clientToken, selectedPromo.code).first());
    if (!existingReservation) {
      await database.batch([
        database.prepare("UPDATE reservations SET status = 'released', updated_at = ? WHERE client_token = ? AND status = 'active'").bind(now(), clientToken),
        database.prepare("UPDATE inventory_keys SET reserved_order_id = NULL, reserved_until = NULL WHERE reserved_order_id = ?").bind(reservation.order_id),
        database.prepare("UPDATE reservations SET inventory_code = NULL, updated_at = ? WHERE order_id = ? AND status = 'released'").bind(now(), reservation.order_id),
      ]);
      throw new Error("Лимит использований промокода исчерпан");
    }
    appliedPromo = selectedPromo.code;
  }

  const orderId = reservation.order_id;
  const amount = Math.max(0, product.price - discount);
  await database
    .prepare(`INSERT OR IGNORE INTO orders
      (id, client_token, sku, amount, unit_price, currency, status, promo_code, discount_amount, reservation_expires_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'created', ?, ?, ?, ?, ?)`)
    .bind(orderId, clientToken, product.sku, amount, product.price, product.currency, appliedPromo, discount, reservation.expires_at, timestamp, timestamp)
    .run();

  const order = (await database.prepare("SELECT * FROM orders WHERE client_token = ?").bind(clientToken).first()) as StoreOrder | null;
  if (!order) throw new Error("Не удалось создать заказ");
  if (appliedPromo) {
    await database.prepare("UPDATE promo_redemptions SET order_id = ? WHERE client_token = ? AND order_id IS NULL").bind(order.id, clientToken).run();
  }
  await processPendingPaymentEvents(order.id);
  return { order: (await getOrder(order.id))!, replayed: false };
}

async function calculateOrderQuote(order: StoreOrder) {
  const product = await db().prepare("SELECT price FROM products WHERE sku = ?").bind(order.sku).first() as { price: number } | null;
  if (!product) throw new Error("Товар не найден");
  let discount = 0;
  if (order.promo_code) {
    const promo = await db().prepare("SELECT type, value FROM promo_codes WHERE code = ?").bind(order.promo_code).first() as { type: string; value: number } | null;
    if (promo) discount = promo.type === "percent" ? Math.floor((product.price * promo.value) / 100) : Math.min(product.price, promo.value);
  }
  const amount = Math.max(0, product.price - discount);
  return { unitPrice: product.price, discount, amount, changed: order.unit_price !== product.price || order.amount !== amount };
}

export async function quoteOrder(orderId: string) {
  const order = await getOrder(orderId);
  if (!order) return null;
  return { order, quote: await calculateOrderQuote(order) };
}

export async function prepareOrderPayment(orderId: string) {
  const order = await getOrder(orderId);
  if (!order) return { kind: "missing" as const, order: null };
  if (order.payment_status === "paid" || order.status === "delivered") return { kind: "ready" as const, order };
  if (order.status === "reservation_expired" || !order.reservation_expires_at || order.reservation_expires_at <= now()) return { kind: "expired" as const, order };
  const quote = await calculateOrderQuote(order);
  if (quote.changed) {
    await db().prepare("UPDATE orders SET unit_price = ?, amount = ?, discount_amount = ?, updated_at = ? WHERE id = ? AND payment_status IS NULL")
      .bind(quote.unitPrice, quote.amount, quote.discount, now(), order.id).run();
    return { kind: "price_changed" as const, order: (await getOrder(order.id))! };
  }
  return { kind: "ready" as const, order };
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
        SET assigned_order_id = ?, assigned_request_id = ?, assigned_at = ?, reserved_order_id = NULL, reserved_until = NULL
        WHERE code = (
          SELECT code FROM (
            SELECT r.inventory_code AS code, 0 AS priority FROM reservations r JOIN inventory_keys k ON k.code = r.inventory_code
            WHERE r.order_id = ? AND r.status = 'paid' AND k.provider = ? AND k.assigned_request_id IS NULL
            UNION ALL
            SELECT code, 1 AS priority FROM inventory_keys WHERE sku = ? AND provider = ? AND assigned_request_id IS NULL AND reserved_order_id IS NULL
          ) ORDER BY priority, code LIMIT 1
        ) AND assigned_request_id IS NULL
        RETURNING code`)
      .bind(orderId, requestId, now(), orderId, provider, sku, provider)
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
  const reserved = await database.prepare("SELECT k.provider FROM reservations r JOIN inventory_keys k ON k.code = r.inventory_code WHERE r.order_id = ?").bind(claimed.id).first() as { provider: "A" | "B" } | null;
  let provider: "A" | "B" = reserved?.provider ?? "A";
  let result = await issueFromProvider(provider, `${baseRequestId}:${provider}`, claimed.id, claimed.sku);
  if (result.kind === "timeout") result = await issueFromProvider(provider, `${baseRequestId}:${provider}`, claimed.id, claimed.sku);
  if (result.kind === "failed" || result.kind === "out_of_stock") {
    provider = provider === "A" ? "B" : "A";
    result = await issueFromProvider(provider, `${baseRequestId}:${provider}`, claimed.id, claimed.sku);
    if (result.kind === "timeout") result = await issueFromProvider(provider, `${baseRequestId}:${provider}`, claimed.id, claimed.sku);
  }

  if (result.kind === "ok") {
    await database.batch([
      database.prepare("UPDATE orders SET status = 'delivered', provider = ?, code = ?, updated_at = ? WHERE id = ? AND code IS NULL")
        .bind(provider, result.code, now(), claimed.id),
      database.prepare("UPDATE reservations SET status = 'fulfilled', updated_at = ? WHERE order_id = ? AND status = 'paid'").bind(now(), claimed.id),
      database.prepare("UPDATE inventory_keys SET reserved_order_id = NULL, reserved_until = NULL WHERE reserved_order_id = ? AND assigned_order_id IS NULL").bind(claimed.id),
    ]);
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
  const event = (await database.prepare("SELECT * FROM payment_events WHERE event_id = ?").bind(eventId).first()) as (PaymentEventInput & { processed_at: string | null; event_created_at: string; received_at: string }) | null;
  if (!event) return "missing";
  if (event.processed_at) return "duplicate";
  const order = await getOrder(event.order_id);
  if (!order) return "pending_order";
  if (event.amount !== order.amount || event.currency !== order.currency) {
    await database.prepare("UPDATE payment_events SET processed_at = ?, processing_result = 'amount_mismatch' WHERE event_id = ? AND processed_at IS NULL").bind(now(), eventId).run();
    return "amount_mismatch";
  }

  if (event.status === "paid") {
    const held = await database.prepare(`UPDATE reservations SET status = 'paid', updated_at = ?
      WHERE order_id = ? AND ((status = 'active' AND expires_at >= ?) OR status = 'paid') RETURNING order_id`)
      .bind(now(), order.id, event.received_at).first();
    if (!held && order.payment_status !== "paid") {
      await database.batch([
        database.prepare("UPDATE orders SET status = 'reservation_expired', updated_at = ? WHERE id = ? AND payment_status IS NULL").bind(now(), order.id),
        database.prepare("UPDATE payment_events SET processed_at = ?, processing_result = 'reservation_expired' WHERE event_id = ? AND processed_at IS NULL").bind(now(), eventId),
      ]);
      return "reservation_expired";
    }
    await database
      .prepare(`UPDATE orders SET payment_status = 'paid', payment_event_at = ?,
        status = CASE WHEN status IN ('created','payment_failed') THEN 'paid' ELSE status END,
        updated_at = ? WHERE id = ? AND payment_status IS NOT 'paid'`)
      .bind(event.event_created_at, now(), order.id)
      .run();
  } else {
    await database.batch([
      database.prepare(`UPDATE orders SET payment_status = 'failed', payment_event_at = ?, status = 'payment_failed', updated_at = ?
        WHERE id = ? AND payment_status IS NOT 'paid' AND status IN ('created','payment_failed')
        AND (payment_event_at IS NULL OR payment_event_at <= ?)`)
        .bind(event.event_created_at, now(), order.id, event.event_created_at),
      database.prepare("UPDATE reservations SET status = 'released', updated_at = ? WHERE order_id = ? AND status = 'active'").bind(now(), order.id),
      database.prepare("UPDATE inventory_keys SET reserved_order_id = NULL, reserved_until = NULL WHERE reserved_order_id = ? AND assigned_order_id IS NULL").bind(order.id),
      database.prepare("UPDATE reservations SET inventory_code = NULL, updated_at = ? WHERE order_id = ? AND status = 'released'").bind(now(), order.id),
    ]);
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

export async function updateCatalogProduct(input: { sku: string; price?: number; stock?: number }) {
  await ensureSeedData();
  await releaseExpiredReservations();
  const database = db();
  const product = await database.prepare("SELECT sku, price FROM products WHERE sku = ?").bind(input.sku).first() as { sku: string; price: number } | null;
  if (!product) throw new Error("Товар не найден");
  const timestamp = now();
  if (input.price !== undefined) {
    const price = clampInt(input.price);
    if (price < 1 || price > 1_000_000) throw new Error("Некорректная цена");
    await database.prepare("UPDATE products SET price = ?, updated_at = ? WHERE sku = ?").bind(price, timestamp, input.sku).run();
  }
  if (input.stock !== undefined) {
    const desiredAvailable = Math.min(clampInt(input.stock), 1000);
    const free = await database.prepare("SELECT COUNT(*) AS count FROM inventory_keys WHERE sku = ? AND assigned_order_id IS NULL AND reserved_order_id IS NULL").bind(input.sku).first() as { count: number };
    const difference = desiredAvailable - Number(free.count);
    if (difference > 0) {
      await database.batch(Array.from({ length: difference }, () => database.prepare("INSERT INTO inventory_keys (code, sku, provider) VALUES (?, ?, ?)").bind(`LIVE-${input.sku}-${crypto.randomUUID()}`, input.sku, "A")));
    } else if (difference < 0) {
      await database.prepare(`DELETE FROM inventory_keys WHERE code IN (
        SELECT code FROM inventory_keys WHERE sku = ? AND assigned_order_id IS NULL AND reserved_order_id IS NULL ORDER BY code LIMIT ?
      )`).bind(input.sku, -difference).run();
    }
  }
  return (await listProducts()).find((item) => item.sku === input.sku);
}

export async function searchCatalog(input: { query?: string; type?: string; maxPrice?: number }) {
  const base = await listProducts() as Array<{ sku: string; name: string; type: string; price: number; currency: string; available: number }>;
  const offers = Array.from({ length: 2400 }, (_, index) => {
    const product = base[index % base.length];
    const seller = (index % 24) + 1;
    return {
      sku: `${product.sku}-OFFER-${index + 1}`,
      product_sku: product.sku,
      name: product.name,
      type: product.type,
      price: product.price + (index % 7) * 15,
      currency: product.currency,
      available: product.available > 0 ? Math.max(1, product.available - (index % 3)) : 0,
      seller: `Продавец ${seller}`,
      rating: (4.5 + (index % 6) / 10).toFixed(1),
    };
  });
  const query = input.query?.trim().toLocaleLowerCase("ru") ?? "";
  const filtered = offers.filter((offer) => (!query || `${offer.name} ${offer.seller}`.toLocaleLowerCase("ru").includes(query))
    && (!input.type || offer.type === input.type)
    && (!input.maxPrice || offer.price <= input.maxPrice));
  return { total: filtered.length, offers: filtered.slice(0, 30) };
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
    database.prepare("DELETE FROM reservations"),
    database.prepare("UPDATE inventory_keys SET assigned_order_id = NULL, assigned_request_id = NULL, assigned_at = NULL"),
    database.prepare("UPDATE inventory_keys SET reserved_order_id = NULL, reserved_until = NULL"),
    database.prepare("UPDATE provider_settings SET failure_rate = 0, timeout_rate = 0, delay_ms = 0"),
  ]);
}
