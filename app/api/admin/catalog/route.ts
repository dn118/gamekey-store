import { updateCatalogProduct } from "../../../../lib/store";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { sku?: string; price?: number; stock?: number };
    if (!body.sku) return Response.json({ error: "sku обязателен" }, { status: 400 });
    return Response.json({ product: await updateCatalogProduct(body) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось обновить товар" }, { status: 400 });
  }
}
