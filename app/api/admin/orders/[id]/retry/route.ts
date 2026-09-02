import { issueOrder } from "../../../../../../lib/store";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const order = await issueOrder(id, true);
  if (!order) return Response.json({ error: "Заказ не найден" }, { status: 404 });
  return Response.json({ order });
}
