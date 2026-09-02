import { acceptPaymentEvent, getOrder } from "../../../../../lib/store";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const order = await getOrder(id);
    if (!order) return Response.json({ error: "Заказ не найден" }, { status: 404 });
    const body = (await request.json().catch(() => ({}))) as { status?: "paid" | "failed" };
    const event = {
      event_id: `evt_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`,
      order_id: order.id,
      status: body.status === "failed" ? ("failed" as const) : ("paid" as const),
      amount: order.amount,
      currency: order.currency,
      created_at: new Date().toISOString(),
    };
    const result = await acceptPaymentEvent(event);
    return Response.json({ event, ...result, order: await getOrder(order.id) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Ошибка оплаты" }, { status: 400 });
  }
}
