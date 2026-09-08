import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const products = sqliteTable("products", {
  sku: text("sku").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  price: integer("price").notNull(),
  currency: text("currency").notNull().default("RUB"),
  updatedAt: text("updated_at").notNull().default("1970-01-01T00:00:00.000Z"),
});

export const orders = sqliteTable("orders", {
  id: text("id").primaryKey(),
  clientToken: text("client_token").notNull().unique(),
  sku: text("sku").notNull(),
  amount: integer("amount").notNull(),
  unitPrice: integer("unit_price").notNull().default(0),
  currency: text("currency").notNull(),
  status: text("status").notNull().default("created"),
  paymentStatus: text("payment_status"),
  paymentEventAt: text("payment_event_at"),
  promoCode: text("promo_code"),
  discountAmount: integer("discount_amount").notNull().default(0),
  reservationExpiresAt: text("reservation_expires_at"),
  deliveryRequestId: text("delivery_request_id").unique(),
  provider: text("provider"),
  code: text("code").unique(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const reservations = sqliteTable("reservations", {
  orderId: text("order_id").primaryKey(),
  clientToken: text("client_token").notNull().unique(),
  sku: text("sku").notNull(),
  inventoryCode: text("inventory_code").unique(),
  status: text("status").notNull().default("active"),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const paymentEvents = sqliteTable("payment_events", {
  eventId: text("event_id").primaryKey(),
  orderId: text("order_id").notNull(),
  status: text("status").notNull(),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull(),
  eventCreatedAt: text("event_created_at").notNull(),
  receivedAt: text("received_at").notNull(),
  processedAt: text("processed_at"),
  processingResult: text("processing_result"),
}, (table) => [uniqueIndex("idx_payment_events_event_id").on(table.eventId)]);

export const inventoryKeys = sqliteTable("inventory_keys", {
  code: text("code").primaryKey(),
  sku: text("sku").notNull(),
  provider: text("provider").notNull(),
  assignedOrderId: text("assigned_order_id").unique(),
  assignedRequestId: text("assigned_request_id").unique(),
  assignedAt: text("assigned_at"),
  reservedOrderId: text("reserved_order_id").unique(),
  reservedUntil: text("reserved_until"),
});

export const deliveryAttempts = sqliteTable("delivery_attempts", {
  requestId: text("request_id").primaryKey(),
  orderId: text("order_id").notNull(),
  provider: text("provider").notNull(),
  status: text("status").notNull().default("pending"),
  code: text("code").unique(),
  reason: text("reason"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const promoCodes = sqliteTable("promo_codes", {
  code: text("code").primaryKey(),
  type: text("type").notNull(),
  value: integer("value").notNull(),
  currency: text("currency"),
  maxUses: integer("max_uses").notNull(),
});

export const promoRedemptions = sqliteTable("promo_redemptions", {
  clientToken: text("client_token").primaryKey(),
  promoCode: text("promo_code").notNull(),
  discountAmount: integer("discount_amount").notNull(),
  orderId: text("order_id").unique(),
  createdAt: text("created_at").notNull(),
});

export const providerSettings = sqliteTable("provider_settings", {
  provider: text("provider").primaryKey(),
  failureRate: integer("failure_rate").notNull().default(0),
  timeoutRate: integer("timeout_rate").notNull().default(0),
  delayMs: integer("delay_ms").notNull().default(0),
});
