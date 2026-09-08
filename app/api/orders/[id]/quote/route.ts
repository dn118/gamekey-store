import { quoteOrder } from "../../../../../lib/store";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const result = await quoteOrder(id);
  if (!result) return Response.json({ error: "Заказ не найден" }, { status: 404 });
  return Response.json(result, { headers: { "cache-control": "no-store" } });
}
