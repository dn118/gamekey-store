"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type RecoveryOrder = { id: string; sku: string; status: string; updated_at: string };

export default function AdminClient() {
  const [orders, setOrders] = useState<RecoveryOrder[]>([]); const [code, setCode] = useState(""); const [message, setMessage] = useState("");
  const load = useCallback(async () => { const response = await fetch("/api/admin/recovery", { cache: "no-store" }); const data = await response.json(); setOrders(data.orders ?? []); }, []);
  useEffect(() => { load(); }, [load]);
  async function retry(id: string) { setMessage("Повторяем выдачу…"); await fetch(`/api/admin/orders/${id}/retry`, { method: "POST" }); await load(); setMessage("Повторная выдача выполнена безопасно"); }
  async function addKey() { if (!code.trim()) return; const response = await fetch("/api/admin/inventory", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ codes: [code], provider: "A" }) }); const data = await response.json(); setMessage(response.ok ? "Ключ добавлен в пул" : data.error); if (response.ok) setCode(""); }
  return <main className="utility-page admin-page"><a className="back-link" href="/"><ArrowLeft /> В магазин</a><div className="admin-head"><div><p className="eyebrow">СЛУЖЕБНЫЙ РАЗДЕЛ</p><h1>Восстановление выдачи</h1><p className="utility-muted">Оплаченные заказы без ключа. Дизайн намеренно минимальный.</p></div><Button variant="outline" onClick={load}><RefreshCw /> Обновить</Button></div>
    <section className="admin-panel"><h2>Пополнить пул</h2><div className="inventory-form"><Input value={code} onChange={(event) => setCode(event.target.value)} placeholder="XXXX-XXXX-XXXX" /><Button onClick={addKey}>Добавить ключ</Button></div>{message && <p className="admin-message">{message}</p>}</section>
    <section className="admin-panel"><h2>Оплачено, но не выдано</h2><Table><TableHeader><TableRow><TableHead>Заказ</TableHead><TableHead>Товар</TableHead><TableHead>Статус</TableHead><TableHead>Обновлён</TableHead><TableHead></TableHead></TableRow></TableHeader><TableBody>{orders.length === 0 ? <TableRow><TableCell colSpan={5} className="empty-cell">Проблемных заказов нет</TableCell></TableRow> : orders.map((order) => <TableRow key={order.id}><TableCell>{order.id}</TableCell><TableCell>{order.sku}</TableCell><TableCell>{order.status}</TableCell><TableCell>{new Date(order.updated_at).toLocaleString("ru-RU")}</TableCell><TableCell><Button size="sm" onClick={() => retry(order.id)}>Повторить выдачу</Button></TableCell></TableRow>)}</TableBody></Table></section>
  </main>;
}
