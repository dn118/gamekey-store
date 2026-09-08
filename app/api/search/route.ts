import { searchCatalog } from "../../../lib/store";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = await searchCatalog({
    query: url.searchParams.get("q") ?? "",
    type: url.searchParams.get("type") ?? "",
    maxPrice: Number(url.searchParams.get("max_price")) || undefined,
  });
  return Response.json(result, { headers: { "cache-control": "no-store" } });
}
