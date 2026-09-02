import { issueFromProvider } from "../../../../../lib/store";

export async function POST(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  if (!['A', 'B'].includes(provider)) return Response.json({ status: "error", reason: "unknown_provider" }, { status: 404 });
  const body = (await request.json()) as { request_id?: string; sku?: string; order_id?: string };
  if (!body.request_id || !body.sku || !body.order_id) return Response.json({ status: "error", reason: "invalid_request" }, { status: 400 });
  const result = await issueFromProvider(provider as "A" | "B", body.request_id, body.order_id, body.sku);
  if (result.kind === "ok") return Response.json({ status: "ok", request_id: body.request_id, code: result.code });
  return Response.json({ status: "error", reason: result.reason }, { status: result.kind === "out_of_stock" ? 409 : 503 });
}
