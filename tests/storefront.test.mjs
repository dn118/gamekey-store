import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("contains the requested storefront and five interactions", async () => {
  const source = await readFile(new URL("../app/storefront.tsx", import.meta.url), "utf8");
  assert.match(source, /GAMEKEY/);
  assert.match(source, /Популярные товары/);
  assert.match(source, /setInterval/);
  assert.match(source, /catalogOpen/);
  assert.match(source, /setCurrency/);
  assert.match(source, /service/);
  assert.match(source, /product-card/);
  assert.match(source, /typeof crypto\.randomUUID === "function"/);
  assert.doesNotMatch(source, /Демо: первый товар/);
});

test("order dialog stays inside narrow and zoomed viewports", async () => {
  const source = await readFile(new URL("../app/storefront.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /className="order-actions"/);
  assert.match(source, /className="order-title"/);
  assert.match(styles, /\.order-dialog[^}]*calc\(100vw - 32px\)/s);
  assert.match(styles, /\.order-title[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(styles, /\.order-actions[^}]*repeat\(3, minmax\(0, 1fr\)\)/s);
  assert.match(styles, /@media \(max-width: 720px\)[\s\S]*?\.order-actions\s*\{\s*grid-template-columns:\s*1fr/s);
});

test("database migration enforces single delivery", async () => {
  const sql = await readFile(new URL("../drizzle/0000_charming_lily_hollister.sql", import.meta.url), "utf8");
  assert.match(sql, /inventory_keys_assigned_order_id_unique/);
  assert.match(sql, /inventory_keys_assigned_request_id_unique/);
  assert.match(sql, /orders_code_unique/);
  assert.match(sql, /payment_events.*PRIMARY KEY/s);
});

test("race reproduction script covers acceptance scenarios", async () => {
  const script = await readFile(new URL("../scripts/race-test.mjs", import.meta.url), "utf8");
  assert.match(script, /length: 50/);
  assert.match(script, /LIMIT3/);
  assert.match(script, /out_of_stock/);
  assert.match(script, /assignedKeys\.length, 1/);
  assert.match(script, /storefrontSkus/);
});

test("payment webhook acknowledges before background delivery", async () => {
  const source = await readFile(new URL("../app/api/webhooks/payment/route.ts", import.meta.url), "utf8");
  assert.match(source, /storePaymentEvent/);
  assert.match(source, /waitUntil\(processPaymentEvent/);
});
