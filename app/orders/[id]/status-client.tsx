"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Vinext worker tests cannot bundle next/link's dynamic router import. */

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Clock3, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

type Diagnostics = { order: { id: string; sku: string; amount: number; currency: string; status: string; code: string | null; provider: string | null; reservation_expires_at: string | null; updated_at: string }; events: unknown[]; attempts: unknown[]; assignedKeys: unknown[] };
const labels: Record<string, string> = { created: "Товар забронирован", paid: "Оплата подтверждена", delivering: "Получаем ключ", delivered: "Готово", payment_failed: "Оплата не прошла", reservation_expired: "Время брони истекло", out_of_stock: "Ожидаем пополнения", delivery_failed: "Нужна повторная выдача" };

export default function OrderStatusClient({ orderId }: { orderId: string }) {
  const [data, setData] = useState<Diagnostics | null>(null);
  const [error, setError] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const load = useCallback(async () => { const response = await fetch(`/api/orders/${orderId}`, { cache: "no-store" }); const body = await response.json(); if (!response.ok) throw new Error(body.error); setData(body); }, [orderId]);
  useEffect(() => { const initial = window.setTimeout(() => void load().catch((caught) => setError(caught.message)), 0); const timer = window.setInterval(() => load().catch(() => undefined), 2500); return () => { window.clearTimeout(initial); window.clearInterval(timer); }; }, [load]);
  useEffect(() => { const tick = () => setSecondsLeft(data?.order.status === "created" && data.order.reservation_expires_at ? Math.max(0, Math.ceil((new Date(data.order.reservation_expires_at).getTime() - Date.now()) / 1000)) : 0); const initial = window.setTimeout(tick, 0); const timer = window.setInterval(tick, 1000); return () => { window.clearTimeout(initial); window.clearInterval(timer); }; }, [data?.order.status, data?.order.reservation_expires_at]);
  if (error) return <main className="utility-page"><p className="error-banner">{error}</p><a href="/">Вернуться в магазин</a></main>;
  if (!data) return <main className="utility-page"><p>Загружаем заказ…</p></main>;
  const { order } = data;
  return <main className="utility-page"><a className="back-link" href="/"><ArrowLeft /> В магазин</a><section className="status-card">
    <div className={`status-icon ${order.status === "delivered" ? "success" : ""}`}>{order.status === "delivered" ? <CheckCircle2 /> : <Clock3 />}</div>
    <p className="eyebrow">ЗАКАЗ {order.id}</p><h1>{labels[order.status] ?? order.status}</h1><p className="utility-muted">Статус обновляется автоматически. Повторные вебхуки не создадут новую выдачу.</p>
    <dl><div><dt>Товар</dt><dd>{order.sku}</dd></div><div><dt>Сумма</dt><dd>{order.amount} {order.currency}</dd></div>{order.status === "created" && <div><dt>Бронь</dt><dd>{String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:{String(secondsLeft % 60).padStart(2, "0")}</dd></div>}<div><dt>Поставщик</dt><dd>{order.provider ?? "—"}</dd></div></dl>
    {order.code && <div className="key-box"><span>Ваш ключ</span><code>{order.code}</code><Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(order.code!)}><Copy /> Копировать</Button></div>}
    <details><summary>Техническая диагностика</summary><pre>{JSON.stringify({ events: data.events.length, attempts: data.attempts, assignedKeys: data.assignedKeys }, null, 2)}</pre></details>
  </section></main>;
}
