import { getDiagnostics } from "../../../../lib/store";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const diagnostics = await getDiagnostics(id);
  if (!diagnostics.order) return Response.json({ error: "Заказ не найден" }, { status: 404 });
  return Response.json(diagnostics);
}
