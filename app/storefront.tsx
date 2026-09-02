"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Gamepad2, Grid2X2, Heart, Search, ShoppingBag, UserRound } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Order = { id: string; amount: number; currency: string; status: string; code: string | null; promo_code: string | null; discount_amount: number };

const services = [["Steam", "ST"], ["Telegram", "TG"], ["Roblox", "R"], ["Brawl Stars", "BS"], ["PUBG Mobile", "P"], ["App Store", "A"], ["ChatGPT", "AI"], ["PlayStation", "PS"], ["TikTok", "TT"], ["Mobile Legends", "ML"]];
const products = [
  { sku: "STEAM-TOPUP-500", name: "Пополнение Steam 500 ₽", price: 500, old: 690, tone: "lime" },
  { sku: "KEY-CS2-PRIME", name: "CS2 Prime Status ключ", price: 1290, old: 1590, tone: "blue" },
  { sku: "KEY-GTA5", name: "GTA V ключ активации", price: 1990, old: 2390, tone: "orange" },
  { sku: "KEY-EFT", name: "Escape from Tarkov ключ", price: 3490, old: 3990, tone: "purple" },
  { sku: "SUB-DISCORD-1M", name: "Discord Nitro 1 месяц", price: 399, old: 590, tone: "pink" },
];
const slides = [
  { kicker: "Новые релизы", title: "Играй сегодня", text: "Ключи, пополнения и подписки с моментальной выдачей", accent: "#b9ff35" },
  { kicker: "Пополнение Steam", title: "Без лишнего ожидания", text: "Создай заказ, подтверди оплату и сразу получи код", accent: "#59d5ff" },
  { kicker: "Скидка на первый заказ", title: "WELCOME10", text: "Скидка рассчитывается на сервере", accent: "#ff7e4d" },
];
const statusLabels: Record<string, string> = { created: "Ожидает оплаты", paid: "Оплачен", delivering: "Получаем ключ", delivered: "Ключ выдан", payment_failed: "Оплата отклонена", out_of_stock: "Оплачен, ожидает пополнения", delivery_failed: "Ошибка выдачи — можно повторить" };

export default function Storefront() {
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [slide, setSlide] = useState(0);
  const [currency, setCurrency] = useState("$");
  const [promo, setPromo] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const catalogRef = useRef<HTMLDivElement>(null);
  const purchaseRef = useRef(false);

  useEffect(() => { const timer = window.setInterval(() => setSlide((value) => (value + 1) % slides.length), 5000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (catalogRef.current && !catalogRef.current.contains(event.target as Node)) setCatalogOpen(false); };
    document.addEventListener("mousedown", close); return () => document.removeEventListener("mousedown", close);
  }, []);

  async function buy(sku: string) {
    if (purchaseRef.current) return;
    purchaseRef.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_token: `buy_${crypto.randomUUID()}`, sku, promo_code: promo || undefined }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось создать заказ");
      setOrder(data.order); setDialogOpen(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Не удалось создать заказ"); }
    finally { setBusy(false); purchaseRef.current = false; }
  }

  async function pay(status: "paid" | "failed") {
    if (!order || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/orders/${order.id}/pay`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Ошибка оплаты");
      setOrder(data.order);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Ошибка оплаты"); }
    finally { setBusy(false); }
  }

  const activeSlide = slides[slide];
  return <main className="store-shell">
    <header className="topbar">
      <a className="brand" href="#" aria-label="GameKey Store"><Gamepad2 /><span>GAMEKEY</span></a>
      <div className="catalog-wrap" ref={catalogRef}>
        <button className="catalog-button" onClick={() => setCatalogOpen((open) => !open)} aria-expanded={catalogOpen}><Grid2X2 /> Каталог</button>
        {catalogOpen && <CatalogMenu />}
      </div>
      <label className="search-box"><span className="sr-only">Поиск</span><input placeholder="Игра, приложение или услуга..." /><Heart className="search-heart" /><span className="search-action"><Search /></span></label>
      <button className="profile-button" aria-label="Профиль"><UserRound /></button>
    </header>

    <section className="hero" style={{ "--slide-accent": activeSlide.accent } as React.CSSProperties}>
      <div className="hero-copy"><span>{activeSlide.kicker}</span><h1>{activeSlide.title}</h1><p>{activeSlide.text}</p></div>
      <div className="hero-mark"><Gamepad2 /></div>
      <div className="hero-controls"><button onClick={() => setSlide((slide - 1 + slides.length) % slides.length)} aria-label="Предыдущий баннер"><ChevronLeft /></button><button onClick={() => setSlide((slide + 1) % slides.length)} aria-label="Следующий баннер"><ChevronRight /></button></div>
      <div className="hero-dots">{slides.map((item, index) => <button key={item.title} className={index === slide ? "active" : ""} onClick={() => setSlide(index)} aria-label={`Слайд ${index + 1}`} />)}</div>
    </section>

    <section className="services" aria-label="Сервисы">
      {services.map(([name, short], index) => <button className={`service service-${index}`} key={name}><span>{short}</span><strong>{name}</strong></button>)}
      <button className="service service-more"><span>+841</span><strong>ещё</strong></button>
    </section>

    <section className="steam-topup">
      <div className="steam-icon">ST</div><div className="steam-title"><strong>Пополнение Steam</strong><span>Бонус 5% на первый платёж</span></div>
      <label className="steam-login"><UserRound /><input placeholder="Логин Steam" /><small>i</small></label>
      <label className="steam-sum"><span>Сумма</span><strong>500 ₽</strong></label>
      <div className="currencies">{["$", "₸", "₽"].map((item) => <button key={item} className={currency === item ? "active" : ""} onClick={() => setCurrency(item)}>{item}</button>)}</div>
      <button className="pay-button" onClick={() => buy("STEAM-TOPUP-500")} disabled={busy}>Оплатить 500 ₽</button>
    </section>

    <section className="products-section" id="products">
      <div className="section-heading"><div><h2>Популярные товары</h2><p>Моментальная выдача после подтверждения оплаты</p></div><label className="promo-field"><span>Промокод</span><Input value={promo} onChange={(event) => setPromo(event.target.value.toUpperCase())} placeholder="WELCOME10" /></label></div>
      {error && <p className="error-banner" role="alert">{error}</p>}
      <div className="product-grid">{products.map((product) => <article className="product-card" key={product.sku}>
        <div className={`product-cover cover-${product.tone}`}><span>GAMEKEY</span><strong>{product.name.split(" ")[0]}</strong><small>DIGITAL EDITION</small></div>
        <div className="product-body"><span className="instant">⚡ МОМЕНТАЛЬНО</span><h3>{product.name}</h3><div className="price"><strong>{product.price.toLocaleString("ru-RU")} ₽</strong><del>{product.old.toLocaleString("ru-RU")} ₽</del></div>
          <Button className="buy-button" onClick={() => buy(product.sku)} disabled={busy || product.sku !== "STEAM-TOPUP-500"}>{product.sku === "STEAM-TOPUP-500" ? <><ShoppingBag /> Купить</> : "Демо: первый товар"}</Button>
        </div></article>)}</div>
    </section>

    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="order-dialog"><DialogHeader><DialogTitle>Заказ {order?.id}</DialogTitle><DialogDescription>Оплата эмулируется тестовым вебхуком. Реального списания нет.</DialogDescription></DialogHeader>
      {order && <div className="order-summary"><div><span>Статус</span><strong className={`status status-${order.status}`}>{statusLabels[order.status] ?? order.status}</strong></div><div><span>К оплате</span><strong>{order.amount} {order.currency}</strong></div>{order.promo_code && <div><span>Промокод</span><strong>{order.promo_code} · −{order.discount_amount} ₽</strong></div>}{order.code && <div className="delivered-code"><span>Ваш ключ</span><code>{order.code}</code></div>}</div>}
      {error && <p className="error-banner" role="alert">{error}</p>}
      <DialogFooter>{order?.status === "created" && <><Button variant="outline" onClick={() => pay("failed")} disabled={busy}>Неуспешная оплата</Button><Button onClick={() => pay("paid")} disabled={busy}>{busy ? "Обрабатываем…" : "Оплатить успешно"}</Button></>}{order && <Button variant="outline" asChild><a href={`/orders/${order.id}`}>Страница статуса</a></Button>}</DialogFooter>
    </DialogContent></Dialog>
  </main>;
}

function CatalogMenu() {
  const columns = [["Steam", "Игры и DLC", "Пополнение баланса", "Подарочные карты", "Смена региона"], ["PlayStation", "Игры и DLC", "Пополнение баланса", "Новые аккаунты", "PS Plus"], ["Xbox", "Игры и DLC", "Пополнение баланса", "Xbox Game Pass", "Услуги"], ["Nintendo", "Игры и DLC", "Подарочные карты", "Новые аккаунты", "NS Online"], ["Battle.net", "World of Warcraft", "Подарочные карты", "Прямое пополнение", "Смена региона"]];
  return <div className="catalog-menu"><nav className="catalog-sidebar">{["Игры и игровые сервисы", "Игровые ценности", "Мобильные игры", "Сервисы и соцсети", "Программы"].map((item, index) => <button key={item} className={index === 0 ? "active" : ""}>{item}<ChevronRight /></button>)}</nav><div className="catalog-columns">{columns.map(([title, ...items]) => <div key={title}><h3>{title} <ChevronRight /></h3>{items.map((item) => <a href="#products" key={item}>{item}</a>)}</div>)}</div></div>;
}
