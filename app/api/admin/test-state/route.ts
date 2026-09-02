import { setTestState } from "../../../../lib/store";
import { env } from "cloudflare:workers";

export async function POST(request: Request) {
  if (!env.TEST_ADMIN_TOKEN || request.headers.get("x-admin-token") !== env.TEST_ADMIN_TOKEN) return Response.json({ error: "Недостаточно прав" }, { status: 403 });
  const body = (await request.json()) as { action?: "reset" | "drain" };
  if (!body.action || !["reset", "drain"].includes(body.action)) return Response.json({ error: "action должен быть reset или drain" }, { status: 400 });
  await setTestState(body.action);
  return Response.json({ ok: true, action: body.action });
}
