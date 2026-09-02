import { addInventory } from "../../../../lib/store";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { codes?: string[]; provider?: "A" | "B" };
    return Response.json(await addInventory(body.codes ?? [], body.provider));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Ошибка пополнения" }, { status: 400 });
  }
}
