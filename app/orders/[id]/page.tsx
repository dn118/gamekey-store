import OrderStatusClient from "./status-client";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrderStatusClient orderId={id} />;
}
