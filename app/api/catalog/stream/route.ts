import { listProducts } from "../../../../lib/store";

export async function GET(request: Request) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let previous = "";
      const send = async () => {
        const payload = JSON.stringify({ products: await listProducts() });
        if (payload !== previous) {
          previous = payload;
          controller.enqueue(encoder.encode(`event: catalog\ndata: ${payload}\n\n`));
        } else controller.enqueue(encoder.encode(": keep-alive\n\n"));
      };
      try {
        while (!request.signal.aborted) {
          await send();
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch {
        // The browser reconnects EventSource automatically after a network break.
      } finally {
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive" } });
}
