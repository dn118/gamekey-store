import { createOrder } from "../../../lib/store";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { client_token?: string; sku?: string; promo_code?: string; order_id?: string };
    if (!body.client_token || !body.sku) return Response.json({ error: "client_token и sku обязательны" }, { status: 400 });
    const result = await createOrder({ clientToken: body.client_token, sku: body.sku, promoCode: body.promo_code, orderId: body.order_id });
    return Response.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось создать заказ" }, { status: 400 });
  }
}
