import { listProducts } from "../../../lib/store";

export async function GET() {
  try {
    return Response.json({ products: await listProducts() });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Ошибка каталога" }, { status: 500 });
  }
}
