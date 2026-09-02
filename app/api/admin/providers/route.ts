import { setProviderSettings } from "../../../../lib/store";

export async function POST(request: Request) {
  const body = (await request.json()) as { provider?: "A" | "B"; failure_rate?: number; timeout_rate?: number; delay_ms?: number };
  if (!body.provider || !["A", "B"].includes(body.provider)) return Response.json({ error: "provider должен быть A или B" }, { status: 400 });
  await setProviderSettings(body.provider, { failureRate: body.failure_rate, timeoutRate: body.timeout_rate, delayMs: body.delay_ms });
  return Response.json({ updated: true });
}
