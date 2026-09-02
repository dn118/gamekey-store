import { acceptPaymentEvent, type PaymentEventInput } from "../../../../lib/store";

export async function POST(request: Request) {
  try {
    const event = (await request.json()) as PaymentEventInput;
    const result = await acceptPaymentEvent(event);
    return Response.json(result, { status: 200 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Некорректный вебхук" }, { status: 400 });
  }
}
