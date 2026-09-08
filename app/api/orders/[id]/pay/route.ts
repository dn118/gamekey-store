import { acceptPaymentEvent, getOrder, prepareOrderPayment } from "../../../../../lib/store";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const order = await getOrder(id);
    if (!order) return Response.json({ error: "Заказ не найден" }, { status: 404 });
    if (order.payment_status === "paid" || order.status === "delivered") {
      return Response.json({ replayed: true, order });
    }
    const body = (await request.json().catch(() => ({}))) as { status?: "paid" | "failed" };
    if (body.status !== "failed") {
      const prepared = await prepareOrderPayment(id);
      if (prepared.kind === "expired") return Response.json({ error: "Время брони истекло. Товар снова доступен другим покупателям.", code: "reservation_expired", order: prepared.order }, { status: 409 });
      if (prepared.kind === "price_changed") return Response.json({ error: "Цена изменилась. Проверьте новую сумму перед оплатой.", code: "price_changed", order: prepared.order }, { status: 409 });
    }
    const currentOrder = await getOrder(id);
    if (!currentOrder) return Response.json({ error: "Заказ не найден" }, { status: 404 });
    const event = {
      event_id: `evt_checkout_${order.id}_${body.status === "failed" ? "failed" : "paid"}`,
      order_id: order.id,
      status: body.status === "failed" ? ("failed" as const) : ("paid" as const),
      amount: currentOrder.amount,
      currency: currentOrder.currency,
      created_at: new Date().toISOString(),
    };
    const result = await acceptPaymentEvent(event);
    return Response.json({ event, ...result, order: await getOrder(order.id) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Ошибка оплаты" }, { status: 400 });
  }
}
