export const CATALOG = [
  { sku: "STEAM-TOPUP-500", name: "Пополнение Steam 500 ₽", type: "topup", price: 500, currency: "RUB" },
  { sku: "STEAM-TOPUP-1000", name: "Пополнение Steam 1000 ₽", type: "topup", price: 1000, currency: "RUB" },
  { sku: "STEAM-TOPUP-2500", name: "Пополнение Steam 2500 ₽", type: "topup", price: 2500, currency: "RUB" },
  { sku: "KEY-CS2-PRIME", name: "CS2 Prime Status ключ", type: "key", price: 1290, currency: "RUB" },
  { sku: "KEY-GTA5", name: "GTA V ключ активации", type: "key", price: 1990, currency: "RUB" },
  { sku: "KEY-EFT", name: "Escape from Tarkov ключ", type: "key", price: 3490, currency: "RUB" },
  { sku: "SUB-DISCORD-1M", name: "Discord Nitro 1 месяц", type: "subscription", price: 399, currency: "RUB" },
  { sku: "SUB-YT-3M", name: "YouTube Premium 3 месяца", type: "subscription", price: 1490, currency: "RUB" },
  { sku: "SUB-SPOTIFY-1M", name: "Spotify Premium 1 месяц", type: "subscription", price: 299, currency: "RUB" },
  { sku: "GIFT-PSN-1000", name: "PlayStation Store карта 1000 ₽", type: "giftcard", price: 1000, currency: "RUB" },
  { sku: "GIFT-XBOX-1500", name: "Xbox Gift Card 1500 ₽", type: "giftcard", price: 1500, currency: "RUB" },
  { sku: "GIFT-ROBLOX-800", name: "Roblox 800 Robux", type: "giftcard", price: 890, currency: "RUB" },
] as const;

// 50 explicitly non-redeemable demo keys: ten for each product shown on the
// storefront. Production keys must come from a secret store or supplier API.
const DEMO_STOREFRONT_SKUS = ["STEAM-TOPUP-500", "KEY-CS2-PRIME", "KEY-GTA5", "KEY-EFT", "SUB-DISCORD-1M"];

export const KEY_POOL = DEMO_STOREFRONT_SKUS.flatMap((sku) =>
  Array.from(
    { length: 10 },
    (_, index) => ({
      code: `DEMO-${sku}-${String(index + 1).padStart(2, "0")}`,
      sku,
    }),
  ),
);

export const PROMOS = [
  { code: "WELCOME10", type: "percent", value: 10, currency: null, maxUses: 100 },
  { code: "GG500", type: "amount", value: 500, currency: "RUB", maxUses: 20 },
  { code: "LIMIT3", type: "percent", value: 25, currency: null, maxUses: 3 },
  { code: "ONCEONLY", type: "percent", value: 50, currency: null, maxUses: 1 },
] as const;
