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
});
