import { listRecoveryOrders } from "../../../../lib/store";

export async function GET() {
  return Response.json({ orders: await listRecoveryOrders() });
}
