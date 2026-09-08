"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Box,
  ChevronLeft,
  ChevronRight,
  Gamepad2,
  Grid2X2,
  Heart,
  MessageCircle,
  Search,
  Send,
  ShoppingBag,
  Smartphone,
  Store,
  UserRound,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Order = { id: string; sku: string; amount: number; unit_price: number; currency: string; status: string; code: string | null; promo_code: string | null; discount_amount: number; reservation_expires_at: string | null };
type LiveProduct = { sku: string; name: string; type: string; price: number; currency: string; available: number };
type SearchOffer = { sku: string; product_sku: string; name: string; type: string; price: number; currency: string; available: number; seller: string; rating: string };

const services = [
  { name: "Steam", icon: Gamepad2 },
  { name: "Telegram", icon: Send },
  { name: "Roblox", icon: Box },
  { name: "Brawl Stars", icon: Gamepad2 },
  { name: "PUBG Mobile", icon: Smartphone },
  { name: "App Store", icon: Store },
  { name: "ChatGPT", icon: Bot },
  { name: "PlayStation", icon: Gamepad2 },
  { name: "TikTok", icon: MessageCircle },
  { name: "Mobile Legends", icon: Smartphone },
];
const productCards = [
  { sku: "STEAM-TOPUP-500", name: "Пополнение Steam 500 ₽", price: 500, old: 690, tone: "lime", art: Gamepad2 },
  { sku: "KEY-CS2-PRIME", name: "CS2 Prime Status ключ", price: 1290, old: 1590, tone: "blue", art: Search },
  { sku: "KEY-GTA5", name: "GTA V ключ активации", price: 1990, old: 2390, tone: "orange", art: Gamepad2 },
  { sku: "KEY-EFT", name: "Escape from Tarkov ключ", price: 3490, old: 3990, tone: "purple", art: Box },
  { sku: "SUB-DISCORD-1M", name: "Discord Nitro 1 месяц", price: 399, old: 590, tone: "pink", art: MessageCircle },
];
const slides = [
  { kicker: "Новые релизы", title: "Играй сегодня", text: "Ключи, пополнения и подписки с моментальной выдачей", accent: "#b9ff35" },
  { kicker: "Пополнение Steam", title: "Без лишнего ожидания", text: "Создай заказ, подтверди оплату и сразу получи код", accent: "#59d5ff" },
  { kicker: "Скидка на первый заказ", title: "WELCOME10", text: "Скидка рассчитывается на сервере", accent: "#ff7e4d" },
];
const statusLabels: Record<string, string> = { created: "Забронирован", paid: "Оплачен", delivering: "Получаем ключ", delivered: "Ключ выдан", payment_failed: "Оплата отклонена", reservation_expired: "Время брони истекло", out_of_stock: "Оплачен, ожидает пополнения", delivery_failed: "Ошибка выдачи — можно повторить" };

function uniqueToken(prefix: string) {
  const uuid = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${uuid}`;
}

export default function Storefront() {
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [slide, setSlide] = useState(0);
  const [currency, setCurrency] = useState("$");
  const [promo, setPromo] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [liveProducts, setLiveProducts] = useState<LiveProduct[]>([]);
  const [connected, setConnected] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [quoteAmount, setQuoteAmount] = useState<number | null>(null);
  const [priceNotice, setPriceNotice] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [offers, setOffers] = useState<SearchOffer[]>([]);
  const [offerTotal, setOfferTotal] = useState(0);
  const [searching, setSearching] = useState(false);
  const catalogRef = useRef<HTMLDivElement>(null);
  const purchaseRef = useRef(false);
  const purchaseTokens = useRef<Record<string, string>>({});
  const searchSequence = useRef(0);

  useEffect(() => { const timer = window.setInterval(() => setSlide((value) => (value + 1) % slides.length), 5000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (catalogRef.current && !catalogRef.current.contains(event.target as Node)) setCatalogOpen(false); };
    document.addEventListener("mousedown", close); return () => document.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      setQuery(params.get("q") ?? ""); setTypeFilter(params.get("type") ?? ""); setMaxPrice(params.get("max_price") ?? "");
      const savedOrder = params.get("order") ?? window.localStorage.getItem("gamekey:last-order");
      if (savedOrder) fetch(`/api/orders/${savedOrder}`, { cache: "no-store" }).then((response) => response.json()).then((data) => {
        if (data.order) { setOrder(data.order); setDialogOpen(true); }
      }).catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let fallback: number | undefined;
    const apply = (payload: { products?: LiveProduct[] }) => { if (payload.products) setLiveProducts(payload.products); setConnected(true); };
    const load = () => fetch("/api/catalog", { cache: "no-store" }).then((response) => response.json()).then(apply).catch(() => setConnected(false));
    load();
    const events = new EventSource("/api/catalog/stream");
    events.addEventListener("catalog", (event) => apply(JSON.parse((event as MessageEvent).data)));
    events.onerror = () => { setConnected(false); if (!fallback) fallback = window.setInterval(load, 2500); };
    events.onopen = () => { setConnected(true); if (fallback) { window.clearInterval(fallback); fallback = undefined; } };
    return () => { events.close(); if (fallback) window.clearInterval(fallback); };
  }, []);

  useEffect(() => {
    if (!order?.reservation_expires_at || order.status !== "created") return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((new Date(order.reservation_expires_at!).getTime() - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) fetch(`/api/orders/${order.id}`, { cache: "no-store" }).then((response) => response.json()).then((data) => data.order && setOrder(data.order)).catch(() => undefined);
    };
    const initial = window.setTimeout(tick, 0); const timer = window.setInterval(tick, 1000); return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [order?.id, order?.reservation_expires_at, order?.status]);

  useEffect(() => {
    const currentOrder = order;
    if (!currentOrder || currentOrder.status !== "created") return;
    fetch(`/api/orders/${currentOrder.id}/quote`, { cache: "no-store" }).then((response) => response.json()).then((data) => {
      if (!data.quote) return;
      setQuoteAmount(data.quote.amount);
      setPriceNotice(data.quote.changed ? `Цена изменилась: теперь ${data.quote.amount.toLocaleString("ru-RU")} ₽. Подтвердите новую сумму перед оплатой.` : "");
    }).catch(() => undefined);
  }, [order, liveProducts]);

  useEffect(() => {
    const controller = new AbortController();
    const sequence = ++searchSequence.current;
    const params = new URLSearchParams(window.location.search);
    if (query) params.set("q", query); else params.delete("q");
    if (typeFilter) params.set("type", typeFilter); else params.delete("type");
    if (maxPrice) params.set("max_price", maxPrice); else params.delete("max_price");
    window.history.replaceState({}, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`);
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const search = new URLSearchParams({ q: query }); if (typeFilter) search.set("type", typeFilter); if (maxPrice) search.set("max_price", maxPrice);
        const response = await fetch(`/api/search?${search}`, { signal: controller.signal, cache: "no-store" });
        const data = await response.json();
        if (sequence === searchSequence.current) { setOffers(data.offers ?? []); setOfferTotal(data.total ?? 0); }
      } catch (caught) { if ((caught as Error).name !== "AbortError") setError("Поиск временно недоступен"); }
      finally { if (sequence === searchSequence.current) setSearching(false); }
    }, 120);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query, typeFilter, maxPrice, liveProducts]);

  async function buy(sku: string) {
    if (purchaseRef.current) return;
    purchaseRef.current = true; setBusy(true); setError("");
    try {
      const clientToken = purchaseTokens.current[sku] ?? window.localStorage.getItem(`gamekey:purchase:${sku}`) ?? uniqueToken("buy");
      purchaseTokens.current[sku] = clientToken;
      window.localStorage.setItem(`gamekey:purchase:${sku}`, clientToken);
      const response = await fetch("/api/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_token: clientToken, sku, promo_code: promo || undefined }) });
      const data = await response.json();
      if (!response.ok) { if (data.code === "sold_out") window.localStorage.removeItem(`gamekey:purchase:${sku}`); throw new Error(data.error || "Не удалось создать заказ"); }
      setOrder(data.order); setQuoteAmount(data.order.amount); setDialogOpen(true); delete purchaseTokens.current[sku]; window.localStorage.removeItem(`gamekey:purchase:${sku}`); window.localStorage.setItem("gamekey:last-order", data.order.id);
      const params = new URLSearchParams(window.location.search); params.set("order", data.order.id); window.history.replaceState({}, "", `${window.location.pathname}?${params}`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Не удалось создать заказ"); }
    finally { setBusy(false); purchaseRef.current = false; }
  }

  async function pay(status: "paid" | "failed") {
    if (!order || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/orders/${order.id}/pay`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
      const data = await response.json();
      if (!response.ok && data.order) { setOrder(data.order); setQuoteAmount(data.order.amount); setPriceNotice(data.code === "price_changed" ? data.error : ""); throw new Error(data.error); }
      if (!response.ok) throw new Error(data.error || "Ошибка оплаты");
      setOrder(data.order);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Ошибка оплаты"); }
    finally { setBusy(false); }
  }

  const activeSlide = slides[slide];
  const liveBySku = useMemo(() => new Map(liveProducts.map((product) => [product.sku, product])), [liveProducts]);
  return <main className="store-shell">
    <header className="topbar">
      <a className="brand" href="#" aria-label="GameKey Store"><Gamepad2 /><span>GAMEKEY</span></a>
      <div className="catalog-wrap" ref={catalogRef}>
        <button className="catalog-button" onClick={() => setCatalogOpen((open) => !open)} aria-expanded={catalogOpen}><Grid2X2 /> Каталог</button>
        {catalogOpen && <CatalogMenu />}
      </div>
      <label className="search-box"><span className="sr-only">Поиск</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Игра, приложение или услуга..." /><Heart className="search-heart" /><span className="search-action"><Search /></span></label>
      <button className="profile-button" aria-label="Профиль"><UserRound /></button>
    </header>

    <section className="hero" style={{ "--slide-accent": activeSlide.accent } as React.CSSProperties}>
      <div className="hero-copy"><span>{activeSlide.kicker}</span><h1>{activeSlide.title}</h1><p>{activeSlide.text}</p></div>
      <div className="hero-mark"><Gamepad2 /></div>
      <div className="hero-controls"><button onClick={() => setSlide((slide - 1 + slides.length) % slides.length)} aria-label="Предыдущий баннер"><ChevronLeft /></button><button onClick={() => setSlide((slide + 1) % slides.length)} aria-label="Следующий баннер"><ChevronRight /></button></div>
      <div className="hero-dots">{slides.map((item, index) => <button key={item.title} className={index === slide ? "active" : ""} onClick={() => setSlide(index)} aria-label={`Слайд ${index + 1}`} />)}</div>
    </section>

    <section className="services" aria-label="Сервисы">
      {services.map(({ name, icon: Icon }, index) => <button className={`service service-${index}`} key={name}><span><Icon /></span><strong>{name}</strong></button>)}
      <button className="service service-more"><span><Grid2X2 /><small>841</small></span><strong>ещё</strong></button>
    </section>

    <section className="steam-topup">
      <div className="steam-icon">ST</div><div className="steam-title"><strong>Пополнение Steam</strong><span>Бонус 5% на первый платёж</span></div>
      <label className="steam-login"><UserRound /><input placeholder="Логин Steam" /><small>i</small></label>
      <label className="steam-sum"><span>Сумма</span><strong>500 ₽</strong></label>
      <div className="currencies">{["$", "₸", "₽"].map((item) => <button key={item} className={currency === item ? "active" : ""} onClick={() => setCurrency(item)}>{item}</button>)}</div>
      <button className="pay-button" onClick={() => buy("STEAM-TOPUP-500")} disabled={busy || liveBySku.get("STEAM-TOPUP-500")?.available === 0}>Оплатить 500 ₽</button>
    </section>

    <section className="products-section" id="products">
      <div className="section-heading"><div><h2>Популярные товары</h2><p><span className={`live-dot ${connected ? "online" : ""}`} /> {connected ? "Цены и остатки обновляются в реальном времени" : "Восстанавливаем связь…"}</p></div><label className="promo-field"><span>Промокод</span><Input value={promo} onChange={(event) => setPromo(event.target.value.toUpperCase())} placeholder="WELCOME10" /></label></div>
      <div className="search-filters"><select aria-label="Тип товара" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="">Все категории</option><option value="topup">Пополнения</option><option value="key">Ключи</option><option value="subscription">Подписки</option><option value="giftcard">Подарочные карты</option></select><Input aria-label="Максимальная цена" inputMode="numeric" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value.replace(/\D/g, ""))} placeholder="Цена до, ₽" /><span>{searching ? "Ищем…" : `${offerTotal.toLocaleString("ru-RU")} предложений`}</span></div>
      {error && <p className="error-banner" role="alert">{error}</p>}
      <div className="product-grid">{productCards.map((product) => { const live = liveBySku.get(product.sku); const price = live?.price ?? product.price; const soldOut = live?.available === 0; return <article className={`product-card ${soldOut ? "sold-out" : ""}`} key={product.sku}>
        <div className={`product-cover cover-${product.tone}`}><product.art className="product-art" /><span>GAMEKEY</span><strong>{product.name.split(" ")[0]}</strong><small>DIGITAL EDITION</small></div>
        <div className="product-body"><span className={`stock-label ${soldOut ? "empty" : ""}`}>{soldOut ? "РАСКУПИЛИ" : `В НАЛИЧИИ: ${live?.available ?? "—"}`}</span><h3>{product.name}</h3><div className="price"><strong>{price.toLocaleString("ru-RU")} ₽</strong><del>{product.old.toLocaleString("ru-RU")} ₽</del></div>
          <Button className="buy-button" onClick={() => buy(product.sku)} disabled={busy || soldOut}><ShoppingBag /> {soldOut ? "Нет в наличии" : "Купить"}</Button>
        </div></article>})}</div>
      {(query || typeFilter || maxPrice) && <div className="offer-results" aria-live="polite">{offers.map((offer) => <article key={offer.sku}><div><strong>{offer.name}</strong><span>{offer.seller} · ★ {offer.rating}</span></div><div><strong>{offer.price.toLocaleString("ru-RU")} ₽</strong><Button size="sm" onClick={() => buy(offer.product_sku)} disabled={offer.available === 0}>{offer.available ? "Купить" : "Нет"}</Button></div></article>)}</div>}
    </section>

    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="order-dialog"><DialogHeader><DialogTitle className="order-title">Заказ {order?.id}</DialogTitle><DialogDescription>Оплата эмулируется тестовым вебхуком. Реального списания нет.</DialogDescription></DialogHeader>
      {order && <div className="order-summary"><div><span>Статус</span><strong className={`status status-${order.status}`}>{statusLabels[order.status] ?? order.status}</strong></div>{order.status === "created" && <div className="reservation-timer"><span>Бронь действует</span><strong>{String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:{String(secondsLeft % 60).padStart(2, "0")}</strong></div>}<div><span>К оплате</span><strong>{quoteAmount ?? order.amount} {order.currency}</strong></div>{order.promo_code && <div><span>Промокод</span><strong>{order.promo_code} · −{order.discount_amount} ₽</strong></div>}{order.code && <div className="delivered-code"><span>Ваш ключ</span><code>{order.code}</code></div>}</div>}
      {priceNotice && <p className="price-notice">{priceNotice}</p>}
      {error && <p className="error-banner" role="alert">{error}</p>}
      <DialogFooter className="order-actions">{order?.status === "created" && <><Button variant="outline" onClick={() => pay("failed")} disabled={busy}>Неуспешная оплата</Button><Button onClick={() => pay("paid")} disabled={busy || secondsLeft === 0}>{busy ? "Обрабатываем…" : priceNotice ? "Подтвердить новую цену" : "Оплатить успешно"}</Button></>}{order && <Button variant="outline" asChild><a href={`/orders/${order.id}`}>Страница статуса</a></Button>}</DialogFooter>
    </DialogContent></Dialog>
  </main>;
}

function CatalogMenu() {
  const columns = [["Steam", "Игры и DLC", "Пополнение баланса", "Подарочные карты", "Смена региона"], ["PlayStation", "Игры и DLC", "Пополнение баланса", "Новые аккаунты", "PS Plus"], ["Xbox", "Игры и DLC", "Пополнение баланса", "Xbox Game Pass", "Услуги"], ["Nintendo", "Игры и DLC", "Подарочные карты", "Новые аккаунты", "NS Online"], ["Battle.net", "World of Warcraft", "Подарочные карты", "Прямое пополнение", "Смена региона"]];
  return <div className="catalog-menu"><nav className="catalog-sidebar">{["Игры и игровые сервисы", "Игровые ценности", "Мобильные игры", "Сервисы и соцсети", "Программы"].map((item, index) => <button key={item} className={index === 0 ? "active" : ""}>{item}<ChevronRight /></button>)}</nav><div className="catalog-columns">{columns.map(([title, ...items]) => <div key={title}><h3>{title} <ChevronRight /></h3>{items.map((item) => <a href="#products" key={item}>{item}</a>)}</div>)}</div></div>;
}
