import { waitUntil } from "cloudflare:workers";
import { processPaymentEvent, storePaymentEvent, type PaymentEventInput } from "../../../../lib/store";

export async function POST(request: Request) {
  try {
    const event = (await request.json()) as PaymentEventInput;
    const result = await storePaymentEvent(event);
    waitUntil(processPaymentEvent(event.event_id));
    return Response.json({ ...result, result: result.duplicate ? "duplicate" : "queued" }, { status: 200 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Некорректный вебхук" }, { status: 400 });
  }
}
