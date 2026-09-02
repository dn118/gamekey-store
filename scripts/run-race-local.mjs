import { readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";

const testAdminToken = crypto.randomUUID();
process.env.TEST_ADMIN_TOKEN = testAdminToken;

const mf = new Miniflare({
  modules: true,
  modulesRules: [{ type: "ESModule", include: ["**/*.js"] }],
  modulesRoot: "dist/server",
  scriptPath: "dist/server/index.js",
  compatibilityDate: "2026-05-22",
  compatibilityFlags: ["nodejs_compat"],
  d1Databases: { DB: "gamekey-race-test" },
  bindings: { TEST_ADMIN_TOKEN: testAdminToken },
  serviceBindings: {
    ASSETS: async () => new Response("Not found", { status: 404 }),
  },
});

try {
  const database = await mf.getD1Database("DB");
  const migration = await readFile(new URL("../drizzle/0000_charming_lily_hollister.sql", import.meta.url), "utf8");
  for (const statement of migration.split("--> statement-breakpoint").map((sql) => sql.trim()).filter(Boolean)) {
    await database.prepare(statement).run();
  }
  globalThis.fetch = (input, init) => mf.dispatchFetch(input, init);
  await import("./race-test.mjs");
} finally {
  await mf.dispose();
}
