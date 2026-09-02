import { readFile } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";

test("passes the full concurrent acceptance scenario", { timeout: 30_000 }, async () => {
  const testAdminToken = crypto.randomUUID();
  process.env.TEST_ADMIN_TOKEN = testAdminToken;
  const mf = new Miniflare({
    modules: true,
    modulesRules: [{ type: "ESModule", include: ["**/*.js"] }],
    modulesRoot: "dist/server",
    scriptPath: "dist/server/index.js",
    compatibilityDate: "2026-05-22",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: { DB: `gamekey-test-${Date.now()}` },
    bindings: { TEST_ADMIN_TOKEN: testAdminToken },
    serviceBindings: { ASSETS: async () => new Response("Not found", { status: 404 }) },
  });
  const originalFetch = globalThis.fetch;
  try {
    const database = await mf.getD1Database("DB");
    const migration = await readFile(new URL("../drizzle/0000_charming_lily_hollister.sql", import.meta.url), "utf8");
    for (const statement of migration.split("--> statement-breakpoint").map((sql) => sql.trim()).filter(Boolean)) {
      await database.prepare(statement).run();
    }
    globalThis.fetch = (input, init) => mf.dispatchFetch(input, init);
    await import(`../scripts/race-test.mjs?run=${Date.now()}`);
  } finally {
    globalThis.fetch = originalFetch;
    await mf.dispose();
  }
});
