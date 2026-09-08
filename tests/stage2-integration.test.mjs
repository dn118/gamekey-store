import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";

test("passes the second-stage realtime reservation and last-unit scenarios", { timeout: 30_000 }, async () => {
  const testAdminToken = crypto.randomUUID();
  process.env.TEST_ADMIN_TOKEN = testAdminToken;
  const mf = new Miniflare({
    modules: true,
    modulesRules: [{ type: "ESModule", include: ["**/*.js"] }],
    modulesRoot: "dist/server",
    scriptPath: "dist/server/index.js",
    compatibilityDate: "2026-05-22",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: { DB: `gamekey-stage2-${Date.now()}` },
    bindings: { TEST_ADMIN_TOKEN: testAdminToken, RESERVATION_TTL_SECONDS: "1" },
    serviceBindings: { ASSETS: async () => new Response("Not found", { status: 404 }) },
  });
  const originalFetch = globalThis.fetch;
  try {
    const database = await mf.getD1Database("DB");
    const migrationsUrl = new URL("../drizzle/", import.meta.url);
    for (const file of (await readdir(migrationsUrl)).filter((name) => name.endsWith(".sql")).sort()) {
      const migration = await readFile(new URL(file, migrationsUrl), "utf8");
      for (const statement of migration.split("--> statement-breakpoint").map((sql) => sql.trim()).filter(Boolean)) await database.prepare(statement).run();
    }
    globalThis.fetch = (input, init) => mf.dispatchFetch(input, init);
    await import(`../scripts/stage2-test.mjs?run=${Date.now()}`);
  } finally {
    globalThis.fetch = originalFetch;
    await mf.dispose();
  }
});
